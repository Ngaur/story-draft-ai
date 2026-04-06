import json
import logging
import os
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from app.services.llm_service import get_llm
from app.agents.prompts import (
    DRAFT_STORIES_PROMPT,
    GENERATE_QUESTIONS_PROMPT,
    MERGE_CONCEPTS_PROMPT,
    PARSE_DOCUMENT_PROMPT,
    REFINE_STORIES_PROMPT,
    SYSTEM_PROMPT_ANALYST,
    SYSTEM_PROMPT_FACILITATOR,
)
from app.agents.response_models import (
    ConceptNodeListOutput,
    ClarifyingQuestionsOutput,
    UserStoryListOutput,
)
from app.agents.state import WorkflowState
from app.core.config import settings

logger = logging.getLogger(__name__)

BATCH_SIZE = 4  # concepts per draft_stories LLM call; keeps output within token limits


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


def generate_clarifying_questions(state: WorkflowState) -> dict:
    """Stage 2 — Generate 3–5 clarifying questions per concept node."""
    llm = get_llm()
    structured_llm = llm.with_structured_output(ClarifyingQuestionsOutput)
    concept_nodes_json = json.dumps(state["concept_nodes"], indent=2)
    prompt = GENERATE_QUESTIONS_PROMPT.format(concept_nodes_json=concept_nodes_json)

    try:
        result: ClarifyingQuestionsOutput = structured_llm.invoke(  # type: ignore[assignment]
            [
                SystemMessage(content=SYSTEM_PROMPT_FACILITATOR),
                HumanMessage(content=prompt),
            ]
        )
    except Exception as e:
        logger.error("Question generation LLM call failed: %s", e)
        return {"status": "error", "error_message": f"Question generation failed: {e}"}

    return {
        "clarifying_questions": [q.model_dump() for q in result.questions],
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


def draft_stories(state: WorkflowState) -> dict:
    """Stage 4 — Draft user stories in batches of BATCH_SIZE concepts.

    Batching prevents output-token limit truncation when the concept list is large
    (e.g. 24 features × 1–3 stories each ≈ 24–72 stories in a single response).
    Each batch is an independent LLM call; results are combined in order.
    Only answered clarification questions are forwarded; skipped ones are flagged
    as assumptions in the stories.
    """
    llm = get_llm()
    structured_llm = llm.with_structured_output(UserStoryListOutput)

    # Filter to only answered questions — skipped ones have an empty answer string
    answered = [
        a for a in state.get("clarification_answers", [])
        if str(a.get("answer", "")).strip()
    ]
    clarification_answers_json = json.dumps(answered, indent=2)

    concept_nodes = state["concept_nodes"]
    all_stories: list[dict] = []

    for batch_start in range(0, len(concept_nodes), BATCH_SIZE):
        batch = concept_nodes[batch_start : batch_start + BATCH_SIZE]
        batch_json = json.dumps(batch, indent=2)
        prompt = DRAFT_STORIES_PROMPT.format(
            concept_nodes_json=batch_json,
            clarification_answers_json=clarification_answers_json,
        )
        try:
            result: UserStoryListOutput = structured_llm.invoke(  # type: ignore[assignment]
                [
                    SystemMessage(content=SYSTEM_PROMPT_ANALYST),
                    HumanMessage(content=prompt),
                ]
            )
            all_stories.extend(s.model_dump() for s in result.stories)
            logger.info(
                "Batch %d–%d: drafted %d stories",
                batch_start + 1,
                batch_start + len(batch),
                len(result.stories),
            )
        except Exception as e:
            logger.error(
                "Story drafting failed for batch %d–%d: %s",
                batch_start + 1,
                batch_start + len(batch),
                e,
            )
            return {"status": "error", "error_message": f"Story drafting failed: {e}"}

    return {
        "stories": all_stories,
        "status": "awaiting_review",
    }


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


def refine_stories(state: WorkflowState) -> dict:
    """Stage 6 — Refine stories based on human feedback; loops back to story_review."""
    llm = get_llm()
    structured_llm = llm.with_structured_output(UserStoryListOutput)
    stories_json = json.dumps(state["stories"], indent=2)
    prompt = REFINE_STORIES_PROMPT.format(
        refinement_feedback=state.get("refinement_feedback", ""),
        stories_json=stories_json,
    )

    try:
        result: UserStoryListOutput = structured_llm.invoke(  # type: ignore[assignment]
            [
                SystemMessage(content=SYSTEM_PROMPT_ANALYST),
                HumanMessage(content=prompt),
            ]
        )
    except Exception as e:
        logger.error("Story refinement LLM call failed: %s", e)
        return {"status": "error", "error_message": f"Story refinement failed: {e}"}

    return {
        "stories": [s.model_dump() for s in result.stories],
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
