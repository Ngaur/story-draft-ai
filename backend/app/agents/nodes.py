import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import partial
from pathlib import Path
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage

from app.services.llm_service import get_llm
from app.services.vector_store import build_index, query_index
from app.agents.prompts import (
    DRAFT_STORIES_PROMPT,
    GENERATE_QUESTIONS_PROMPT,
    MERGE_CONCEPTS_PROMPT,
    PARSE_DOCUMENT_PROMPT,
    REFINE_ADDITIVE_PROMPT,
    REFINE_STORIES_PROMPT,
    SUMMARISE_SUPPORTING_DOC_PROMPT,
    SYSTEM_PROMPT_ANALYST,
    SYSTEM_PROMPT_FACILITATOR,
)
from app.agents.response_models import (
    ConceptNodeListOutput,
    ClarifyingQuestionsOutput,
    DocumentSummaryOutput,
    UserStoryListOutput,
)
from app.agents.state import WorkflowState
from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_PARALLEL_LLM_CALLS = 10  # max concurrent LLM calls (questions + draft_stories)


def _inject_supporting_context(
    prompt: str,
    supporting_summaries: list[str],
    supporting_context_mode: Optional[str],
    index_path: Optional[str],
    query: str,
    k: int = 4,
) -> str:
    """Append supporting-document context to a prompt.

    Always injects summaries when present — they are compact, noise-filtered, and carry
    no retrieval error. In RAG mode additionally appends query-specific retrieved chunks
    for detail-level accuracy. Returns prompt unchanged when no supporting docs exist.
    """
    if not supporting_summaries and not supporting_context_mode:
        return prompt

    result = prompt

    # Summaries block — always present when supporting docs exist
    if supporting_summaries:
        block = "\n\n--- Supporting Document Summaries ---\n"
        for i, summary in enumerate(supporting_summaries, 1):
            block += f"\n[Document {i}]\n{summary}\n"
        block += "--- End Summaries ---"
        result += block

    # RAG chunks — only in "rag" mode (large supporting corpus)
    if supporting_context_mode == "rag" and index_path:
        chunks = query_index(index_path, query, k=k)
        if chunks:
            block = "\n\n--- Relevant Detail (retrieved from supporting documents) ---\n"
            block += "\n---\n".join(chunks)
            block += "\n--- End Detail ---"
            result += block

    return result


def index_supporting_docs(state: WorkflowState) -> dict:
    """Summarise and optionally index all supporting documents.

    Steps:
    1. Extract raw text from each doc in parallel.
    2. Measure total char count → decide "full" vs "rag" path.
    3. Summarise each doc in parallel (one focused LLM call per doc, truncated to
       max_doc_chars so even very large docs stay within context limits).
    4. "rag" mode only: build a single merged FAISS index from concatenated raw text.

    Returns state updates for supporting_summaries, supporting_context_mode, and
    (in rag mode) supporting_index_path. Non-fatal throughout — any failure is logged
    and an empty dict is returned so the workflow continues without supporting context.
    """
    from app.services.document_parser import extract_text

    doc_paths: list[str] = state.get("supporting_doc_paths") or []
    if not doc_paths:
        return {}

    # ── Step 1: Extract raw text (parallel) ──────────────────────────────────
    raw_texts: list[str] = []
    with ThreadPoolExecutor(max_workers=min(len(doc_paths), 5)) as ex:
        futures = {ex.submit(extract_text, p): p for p in doc_paths if Path(p).exists()}
        for future, path in futures.items():
            try:
                text = future.result()
                if text.strip():
                    raw_texts.append(text)
            except Exception as e:
                logger.warning("Could not parse supporting doc %s (skipped): %s", path, e)

    if not raw_texts:
        return {}

    # ── Step 2: Threshold decision ────────────────────────────────────────────
    total_chars = sum(len(t) for t in raw_texts)
    threshold = settings.max_supporting_full_context_chars
    mode = "full" if total_chars <= threshold else "rag"
    logger.info(
        "Supporting docs: %d file(s), %d total chars → mode=%s (threshold=%d)",
        len(raw_texts), total_chars, mode, threshold,
    )

    # ── Step 3: Summarise each doc in parallel ────────────────────────────────
    def _summarise_one(text: str) -> str:
        truncated = text[: settings.max_doc_chars]
        llm = get_llm()
        structured_llm = llm.with_structured_output(DocumentSummaryOutput)
        prompt = SUMMARISE_SUPPORTING_DOC_PROMPT.format(document_text=truncated)
        result: DocumentSummaryOutput = structured_llm.invoke(  # type: ignore[assignment]
            [
                SystemMessage(content=SYSTEM_PROMPT_ANALYST),
                HumanMessage(content=prompt),
            ]
        )
        return result.summary

    ordered_summaries: dict[int, str] = {}
    with ThreadPoolExecutor(max_workers=min(len(raw_texts), 5)) as ex:
        future_to_idx = {ex.submit(_summarise_one, t): i for i, t in enumerate(raw_texts)}
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                ordered_summaries[idx] = future.result()
                logger.info("Summarised supporting doc %d/%d", idx + 1, len(raw_texts))
            except Exception as e:
                logger.warning("Summarisation failed for doc %d (skipped): %s", idx + 1, e)

    summaries = [ordered_summaries[i] for i in range(len(raw_texts)) if i in ordered_summaries]
    if not summaries:
        return {}

    # ── Step 4: Build FAISS index (RAG mode only) ─────────────────────────────
    index_path: Optional[str] = None
    if mode == "rag":
        session_id = state["session_id"]
        index_path = str(Path(settings.upload_dir) / session_id / "supporting_index")
        try:
            merged_text = "\n\n".join(raw_texts)
            build_index(merged_text, index_path)
            logger.info("Built merged FAISS index at %s", index_path)
        except Exception as e:
            logger.warning("FAISS index build failed, falling back to summaries only: %s", e)
            mode = "full"
            index_path = None

    return {
        "supporting_summaries": summaries,
        "supporting_context_mode": mode,
        "supporting_index_path": index_path,
    }


def parse_document(state: WorkflowState) -> dict:
    """Stage 1 — Extract structured text, identify concept nodes via LLM.

    For documents within max_doc_chars: single LLM call, full text passed directly.
    For larger documents: map-reduce — extract concepts per semantic chunk then merge.
    Tables are preserved as markdown; DOCX headings drive semantic section splitting.
    """
    from app.services.document_parser import extract_text

    file_path = os.path.join(settings.upload_dir, state["session_id"], state["filename"])
    try:
        raw_text = extract_text(file_path)
    except Exception as e:
        logger.error("Document parsing failed: %s", e)
        return {"status": "error", "error_message": f"Could not read document: {e}"}

    llm = get_llm()
    structured_llm = llm.with_structured_output(ConceptNodeListOutput)

    if len(raw_text) <= settings.max_doc_chars:
        # Single-pass extraction — full document fits in context window
        prompt = PARSE_DOCUMENT_PROMPT.format(document_text=raw_text)
        try:
            result: ConceptNodeListOutput = structured_llm.invoke(  # type: ignore[assignment]
                [
                    SystemMessage(content=SYSTEM_PROMPT_ANALYST),
                    HumanMessage(content=prompt),
                ]
            )
        except Exception as e:
            logger.error("Concept extraction LLM call failed: %s", e)
            return {"status": "error", "error_message": f"Concept extraction failed: {e}"}
        concepts = result.concepts
    else:
        # Map-reduce extraction for large documents
        logger.info(
            "Document exceeds %d chars (%d); using map-reduce concept extraction",
            settings.max_doc_chars,
            len(raw_text),
        )
        concepts = _map_reduce_concepts(raw_text, structured_llm)
        if not concepts:
            return {"status": "error", "error_message": "Concept extraction failed for large document"}

    return {
        "raw_text": raw_text,
        "concept_nodes": [c.model_dump() for c in concepts],
        "status": "processing",
    }


def _map_reduce_concepts(raw_text: str, structured_llm) -> list:  # type: ignore[type-arg]
    """Extract concepts from a large document via map-reduce.

    Map:    run PARSE_DOCUMENT_PROMPT on each semantic chunk independently.
    Reduce: run MERGE_CONCEPTS_PROMPT to deduplicate the combined list.
    Falls back to the unmerged flat list if the reduce step fails.
    """
    from app.services.document_parser import extract_sections

    sections = extract_sections(raw_text)
    chunk_limit = settings.max_doc_chars // 2  # leave room for prompt overhead

    # Bin sections into chunks that each fit within chunk_limit
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for section in sections:
        if current_len + len(section) > chunk_limit and current:
            chunks.append("\n\n".join(current))
            current, current_len = [section], len(section)
        else:
            current.append(section)
            current_len += len(section)
    if current:
        chunks.append("\n\n".join(current))

    # If heading-based split didn't help, fall back to fixed-size char windows
    if len(chunks) == 1 and len(raw_text) > chunk_limit:
        chunks = [raw_text[i : i + chunk_limit] for i in range(0, len(raw_text), chunk_limit)]

    # MAP — extract concepts independently from each chunk
    all_concepts: list = []
    for i, chunk in enumerate(chunks):
        prompt = PARSE_DOCUMENT_PROMPT.format(document_text=chunk)
        try:
            result: ConceptNodeListOutput = structured_llm.invoke(  # type: ignore[assignment]
                [
                    SystemMessage(content=SYSTEM_PROMPT_ANALYST),
                    HumanMessage(content=prompt),
                ]
            )
            all_concepts.extend(result.concepts)
            logger.info("Chunk %d/%d: extracted %d concepts", i + 1, len(chunks), len(result.concepts))
        except Exception as e:
            logger.warning("Chunk %d concept extraction failed: %s", i + 1, e)

    if not all_concepts:
        return []

    # REDUCE — deduplicate via LLM
    concepts_json = json.dumps([c.model_dump() for c in all_concepts], indent=2)
    reduce_prompt = MERGE_CONCEPTS_PROMPT.format(concepts_json=concepts_json)
    try:
        merged: ConceptNodeListOutput = structured_llm.invoke(  # type: ignore[assignment]
            [
                SystemMessage(content=SYSTEM_PROMPT_ANALYST),
                HumanMessage(content=reduce_prompt),
            ]
        )
        logger.info(
            "Map-reduce complete: %d raw → %d merged concepts",
            len(all_concepts),
            len(merged.concepts),
        )
        return merged.concepts
    except Exception as e:
        logger.warning("Concept merge step failed, returning unmerged list: %s", e)
        return all_concepts


def _generate_questions_for_concept(
    concept: dict,
    supporting_summaries: list[str] = [],
    supporting_context_mode: Optional[str] = None,
    supporting_index_path: Optional[str] = None,
) -> list[dict]:
    """Generate clarifying questions for a single concept — runs in its own thread.

    Creates a fresh LLM client per call (thread-safety). Passes the single concept as a
    one-element list so the existing GENERATE_QUESTIONS_PROMPT format string is unchanged.
    All quality rules (10 coverage targets, type-mix mandate, domain entity naming,
    conditional follow-ups, scope-level question) are fully enforced per call — none of
    them require cross-concept awareness. The only prompt rule that referenced multiple
    concepts ("do not repeat equivalent questions across concepts") becomes a no-op when
    each call sees one concept, which is safe: the LLM naturally produces concept-specific
    questions grounded in that concept's description.
    """
    llm = get_llm()
    structured_llm = llm.with_structured_output(ClarifyingQuestionsOutput)
    base_prompt = GENERATE_QUESTIONS_PROMPT.format(
        concept_nodes_json=json.dumps([concept], indent=2)
    )
    query = f"{concept.get('title', '')} {concept.get('description', '')[:200]}"
    prompt = _inject_supporting_context(
        base_prompt, supporting_summaries, supporting_context_mode,
        supporting_index_path, query,
    )
    result: ClarifyingQuestionsOutput = structured_llm.invoke(  # type: ignore[assignment]
        [
            SystemMessage(content=SYSTEM_PROMPT_FACILITATOR),
            HumanMessage(content=prompt),
        ]
    )
    return [q.model_dump() for q in result.questions]


def generate_clarifying_questions(state: WorkflowState) -> dict:
    """Stage 2 — Generate 5–8 clarifying questions per concept, all in parallel.

    Each concept gets its own focused LLM call instead of one large call with all
    concepts. Benefits:
    - Smaller prompt per call: the LLM attends to one concept's description fully
      rather than spreading attention across N concepts + a shared instruction block.
    - Parallel execution: all concept calls fire simultaneously, reducing wall-clock
      time from O(N × latency) to O(latency).
    - Better coverage: a focused call is less likely to skip coverage targets for
      concepts that appear later in a long concept list.
    Results are reassembled in original concept order.
    """
    concept_nodes = state["concept_nodes"]
    n = len(concept_nodes)
    workers = min(n, MAX_PARALLEL_LLM_CALLS)

    ordered: dict[int, list[dict]] = {}
    fn = partial(
        _generate_questions_for_concept,
        supporting_summaries=state.get("supporting_summaries") or [],
        supporting_context_mode=state.get("supporting_context_mode"),
        supporting_index_path=state.get("supporting_index_path"),
    )

    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_to_idx = {
            executor.submit(fn, concept): i
            for i, concept in enumerate(concept_nodes)
        }

        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            concept_title = concept_nodes[idx].get("title", f"concept {idx + 1}")
            try:
                questions = future.result()
                ordered[idx] = questions
                logger.info(
                    "Concept %d/%d (%s): generated %d questions",
                    idx + 1, n, concept_title, len(questions),
                )
            except Exception as e:
                logger.error(
                    "Question generation failed for concept %d/%d (%s): %s",
                    idx + 1, n, concept_title, e,
                )
                return {
                    "status": "error",
                    "error_message": (
                        f"Question generation failed for concept {idx + 1} "
                        f"({concept_title}): {e}"
                    ),
                }

    # Reassemble in original concept order
    all_questions: list[dict] = []
    for i in range(n):
        all_questions.extend(ordered.get(i, []))

    return {
        "clarifying_questions": all_questions,
        "status": "awaiting_clarification",
    }


def clarification_review(state: WorkflowState) -> dict:
    """
    Stage 3 — INTERRUPT node.

    LangGraph pauses BEFORE this node. The /review/clarification endpoint injects
    clarification_answers into state via graph.update_state(), then resumes the thread.
    When this body executes (post-resume), the answers are already in state.
    """
    if state.get("clarification_answers") is None:
        return {"status": "error", "error_message": "clarification_review: no answers in state"}
    return {"status": "processing"}


def _draft_one_concept(
    concept: dict,
    answers_for_concept: list[dict],
    supporting_summaries: list[str] = [],
    supporting_context_mode: Optional[str] = None,
    supporting_index_path: Optional[str] = None,
) -> list[dict]:
    """Draft stories for a single concept — runs in its own thread.

    Creates a fresh LLM client per call: ChatOpenAI's underlying httpx client is not
    thread-safe when shared. Each call receives only the answers that belong to this
    concept, keeping the prompt minimal (~1 500 tokens vs ~8 000 for a batch-of-4).
    """
    llm = get_llm()
    structured_llm = llm.with_structured_output(UserStoryListOutput)
    base_prompt = DRAFT_STORIES_PROMPT.format(
        concept_nodes_json=json.dumps([concept], indent=2),
        clarification_answers_json=json.dumps(answers_for_concept, indent=2),
    )
    query = f"{concept.get('title', '')} {concept.get('description', '')[:200]}"
    prompt = _inject_supporting_context(
        base_prompt, supporting_summaries, supporting_context_mode,
        supporting_index_path, query,
    )
    result: UserStoryListOutput = structured_llm.invoke(  # type: ignore[assignment]
        [
            SystemMessage(content=SYSTEM_PROMPT_ANALYST),
            HumanMessage(content=prompt),
        ]
    )
    return [s.model_dump() for s in result.stories]


def draft_stories(state: WorkflowState) -> dict:
    """Stage 4 — Draft user stories: one LLM call per concept, all in parallel.

    Each call receives a single concept and only that concept's clarifying answers,
    minimising prompt size. Up to MAX_PARALLEL_LLM_CALLS calls run concurrently.
    Results are reassembled in original concept order regardless of completion order.
    Skipped clarification questions are not forwarded; the LLM flags them as assumptions.
    """
    # Build per-concept answer index — only answered (non-empty) questions
    answered = [
        a for a in state.get("clarification_answers", [])
        if str(a.get("answer", "")).strip()
    ]
    answers_by_concept: dict[str, list[dict]] = {}
    for a in answered:
        cid = a.get("concept_id", "")
        answers_by_concept.setdefault(cid, []).append(a)

    concept_nodes = state["concept_nodes"]
    n = len(concept_nodes)
    workers = min(n, MAX_PARALLEL_LLM_CALLS)

    ordered: dict[int, list[dict]] = {}
    draft_fn = partial(
        _draft_one_concept,
        supporting_summaries=state.get("supporting_summaries") or [],
        supporting_context_mode=state.get("supporting_context_mode"),
        supporting_index_path=state.get("supporting_index_path"),
    )

    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_to_idx = {
            executor.submit(
                draft_fn,
                concept,
                answers_by_concept.get(concept.get("id", ""), []),
            ): i
            for i, concept in enumerate(concept_nodes)
        }

        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            concept_title = concept_nodes[idx].get("title", f"concept {idx + 1}")
            try:
                stories = future.result()
                ordered[idx] = stories
                logger.info(
                    "Concept %d/%d (%s): drafted %d stories",
                    idx + 1, n, concept_title, len(stories),
                )
            except Exception as e:
                logger.error(
                    "Story drafting failed for concept %d/%d (%s): %s",
                    idx + 1, n, concept_title, e,
                )
                return {
                    "status": "error",
                    "error_message": (
                        f"Story drafting failed for concept {idx + 1} ({concept_title}): {e}"
                    ),
                }

    # Reassemble in original concept order
    all_stories: list[dict] = []
    for i in range(n):
        all_stories.extend(ordered.get(i, []))

    return {"stories": all_stories, "status": "awaiting_review"}


def story_review(state: WorkflowState) -> dict:
    """
    Stage 5 — INTERRUPT node.

    LangGraph pauses BEFORE this node. The /review/stories endpoint injects
    edited stories + refinement_feedback into state, then resumes. The conditional
    edge downstream reads refinement_feedback to decide the next node.
    """
    if state.get("stories") is None:
        return {"status": "error", "error_message": "story_review: no stories in state"}
    return {"status": "processing"}


def _refine_one_story(
    story: dict,
    refinement_feedback: str,
    supporting_summaries: list[str] = [],
    supporting_context_mode: Optional[str] = None,
    supporting_index_path: Optional[str] = None,
) -> dict:
    """Refine a single story in its own thread — runs in parallel with all other stories.

    Every call receives the FULL refinement feedback text (not a subset), so:
    - Global instructions ("make all ACs more testable") are applied to every story
      because every parallel call sees and applies the same instruction to its own story.
    - Story-specific instructions ("the AMPS routing story needs a governance section")
      are applied only where relevant — other stories' calls correctly ignore them because
      the instruction doesn't match their content.
    - Terminology fixes ("replace 'gateway' with 'acquirer' everywhere") propagate
      uniformly because each call applies the same substitution independently.

    Limitation: feedback that explicitly cross-references stories ("align this story
    with story 3's format") cannot be resolved in a single parallel pass because each
    call sees only one story. For such feedback a second refinement cycle is needed.

    Creates a fresh LLM client per call (ChatOpenAI / httpx is not thread-safe when shared).
    """
    llm = get_llm()
    structured_llm = llm.with_structured_output(UserStoryListOutput)
    base_prompt = REFINE_STORIES_PROMPT.format(
        refinement_feedback=refinement_feedback,
        stories_json=json.dumps([story], indent=2),
    )
    query = (
        f"{story.get('epic_title', '')} {story.get('title', '')} "
        f"{story.get('detailed_description', '')[:150]}"
    )
    prompt = _inject_supporting_context(
        base_prompt, supporting_summaries, supporting_context_mode,
        supporting_index_path, query,
    )
    result: UserStoryListOutput = structured_llm.invoke(  # type: ignore[assignment]
        [
            SystemMessage(content=SYSTEM_PROMPT_ANALYST),
            HumanMessage(content=prompt),
        ]
    )
    # One story in → one story out; fall back to original if LLM returns empty.
    # Always restore original id/concept_id — the LLM may omit or regenerate them,
    # which would break frontend diff lookups.
    refined = result.stories[0].model_dump() if result.stories else story
    refined["id"] = story["id"]
    refined["concept_id"] = story["concept_id"]
    return refined


def _draft_additional_stories(feedback: str, existing_stories: list[dict]) -> list[dict]:
    """Single LLM call that creates brand-new stories requested by additive feedback.

    Runs AFTER the parallel per-story refinement pass.  Each per-story call only
    sees one existing story, so feedback like "add a story for the rule engine"
    cannot be handled there — no individual call has enough context to create something
    completely new.  This dedicated call receives a summary of all existing stories and
    returns ONLY genuinely new stories.

    Returns an empty list if the feedback does not request new stories.
    """
    llm = get_llm()
    structured_llm = llm.with_structured_output(UserStoryListOutput)
    prompt = REFINE_ADDITIVE_PROMPT.format(
        refinement_feedback=feedback,
        existing_stories_summary=json.dumps(
            [
                {
                    "id": s.get("id", ""),
                    "concept_id": s.get("concept_id", ""),
                    "title": s.get("title", ""),
                    "epic_title": s.get("epic_title", ""),
                }
                for s in existing_stories
            ],
            indent=2,
        ),
    )
    result: UserStoryListOutput = structured_llm.invoke(  # type: ignore[assignment]
        [
            SystemMessage(content=SYSTEM_PROMPT_ANALYST),
            HumanMessage(content=prompt),
        ]
    )
    existing_ids = {s.get("id", "") for s in existing_stories}
    return [s.model_dump() for s in result.stories if s.id not in existing_ids]


def refine_stories(state: WorkflowState) -> dict:
    """Stage 6 — Refine each story in parallel, then loop back to story_review.

    Each story is refined independently with the full feedback text.  Global feedback
    ("make ACs more testable") is enforced consistently because every parallel call
    receives identical instructions.  Story order is preserved.
    """
    feedback: str = state.get("refinement_feedback") or ""
    stories = state["stories"]
    n = len(stories)
    workers = min(n, MAX_PARALLEL_LLM_CALLS)

    ordered: dict[int, dict] = {}
    refine_fn = partial(
        _refine_one_story,
        supporting_summaries=state.get("supporting_summaries") or [],
        supporting_context_mode=state.get("supporting_context_mode"),
        supporting_index_path=state.get("supporting_index_path"),
    )

    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_to_idx = {
            executor.submit(refine_fn, story, feedback): i
            for i, story in enumerate(stories)
        }

        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            story_title = stories[idx].get("title", f"story {idx + 1}")
            try:
                refined = future.result()
                ordered[idx] = refined
                logger.info("Refined story %d/%d: %s", idx + 1, n, story_title)
            except Exception as e:
                logger.error(
                    "Story refinement failed for story %d/%d (%s): %s",
                    idx + 1, n, story_title, e,
                )
                return {
                    "status": "error",
                    "error_message": (
                        f"Story refinement failed for story {idx + 1} ({story_title}): {e}"
                    ),
                }

    refined_stories = [ordered[i] for i in range(n)]

    # Additive phase — one extra LLM call to create any new stories the feedback
    # requests.  Per-story parallel calls cannot do this because each only sees one
    # existing story and has no way to produce a wholly new one.
    try:
        new_stories = _draft_additional_stories(feedback, refined_stories)
        if new_stories:
            logger.info(
                "Additive refinement created %d new story/stories", len(new_stories)
            )
        refined_stories.extend(new_stories)
    except Exception as e:
        logger.warning("Additive refinement step failed (non-fatal): %s", e)

    return {
        "stories": refined_stories,
        "refinement_feedback": None,  # clear for next review cycle
        "status": "awaiting_review",
    }


def format_for_export(state: WorkflowState) -> dict:
    """Stage 7 — Build DOCX artifact and mark session complete in registry."""
    from app.services.export_builder import build_docx
    from app.services.session_registry import registry

    artifact_dir = Path(settings.artifacts_dir) / state["session_id"]
    artifact_dir.mkdir(parents=True, exist_ok=True)
    output_path = str(artifact_dir / "user_stories.docx")

    try:
        build_docx(state["stories"], output_path)
    except Exception as e:
        logger.error("DOCX generation failed: %s", e)
        return {"status": "error", "error_message": f"DOCX generation failed: {e}"}

    try:
        registry.save_stories(state["session_id"], state["stories"])
        registry.mark_complete(state["session_id"])
    except Exception as e:
        logger.warning("Registry update failed after DOCX generation: %s", e)

    return {"artifact_path": output_path, "status": "complete"}


# ── Conditional edge ──────────────────────────────────────────────────────────

def route_after_story_review(state: WorkflowState) -> str:
    """Return 'refine_stories' if feedback present, else 'format_for_export'."""
    feedback = state.get("refinement_feedback") or ""
    if feedback.strip():
        return "refine_stories"
    return "format_for_export"
