# story-draft-ai

An AI-powered workflow that transforms concept nodes from uploaded product documents into
Jira-ready user stories through clarifying questions, iterative drafting, and collaborative
refinement.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Architecture Diagram](#architecture-diagram)
5. [LangGraph Workflow](#langgraph-workflow)
   - [Graph Nodes](#graph-nodes)
   - [Interrupt Points](#interrupt-points)
   - [Refinement Loop](#refinement-loop)
   - [WorkflowState](#workflowstate)
6. [Document Ingestion](#document-ingestion)
7. [Supporting Documents & RAG](#supporting-documents--rag)
8. [LLM & Embeddings Service](#llm--embeddings-service)
9. [Structured LLM Outputs](#structured-llm-outputs)
10. [Persistence Layer](#persistence-layer)
    - [SQLite Registry](#sqlite-registry)
    - [File Artifacts](#file-artifacts)
    - [LangGraph Checkpoints](#langgraph-checkpoints)
11. [API Reference](#api-reference)
12. [Frontend Flow](#frontend-flow)
13. [Getting Started](#getting-started)
14. [Configuration](#configuration)

---

## Overview

```
User uploads PRD  +  0–5 optional supporting documents
        │                       │
        │                       ▼
        │             AI extracts + summarises each supporting doc (parallel)
        │                       │
        │             Total chars ≤ 25k?
        │               ├── yes → "full" mode: inject summaries into every prompt
        │               └── no  → "rag"  mode: inject summaries + FAISS chunks
        │
        ▼
  AI extracts concept nodes from PRD
        │
        ▼
  AI generates clarifying questions per concept (parallel)
  Supporting context injected; questions skipped where context already answers them
        │
        ▼  ◄── INTERRUPT 1: human answers questions in UI
  AI drafts user stories (one LLM call per concept, parallel)
  Supporting context injected per call
        │
        ▼  ◄── INTERRUPT 2: human edits stories + optional feedback
  [feedback?] ──yes──► AI refines stories (one LLM call per story, parallel)
        │               Supporting context injected per call
        │               + additive phase (new stories from feedback)
        │ no
        ▼
  Export as DOCX  +  optional Jira ticket creation
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Python 3.11+, FastAPI 0.115 |
| AI orchestration | LangGraph 1.1, `StateGraph` + `SqliteSaver` |
| LLM client | LangChain OpenAI (`ChatOpenAI`) via LiteLLM proxy |
| LLM structured output | Pydantic v2 `with_structured_output()` |
| Embeddings | OpenAI-compatible endpoint (`OpenAIEmbeddings`) |
| Vector store | FAISS (`faiss-cpu`) — per-session index, disk-persisted |
| Text splitting | `langchain-text-splitters` `RecursiveCharacterTextSplitter` |
| PDF parsing | `pdfplumber` (table-aware; prose and table regions extracted separately) |
| DOCX parsing | `python-docx` (raw XML traversal; tables rendered as GFM markdown) |
| DOCX export | `python-docx` |
| Persistence | SQLite (`data/story_draft.db`) + file artifacts |
| HTTP client | `httpx` (async, for Jira REST calls) |
| Frontend runtime | React 18 + TypeScript, Vite |
| Styling | TailwindCSS v3, light theme, Inter font, custom design tokens |
| Client state | Zustand |
| Server state | TanStack React Query v5 |
| Icons | Lucide React |

---

## Project Structure

```
story-draft-ai/
├── backend/
│   ├── main.py                          # FastAPI app entry point, CORS, router mount
│   ├── requirements.txt
│   ├── .env.example                     # Environment variable template
│   └── app/
│       ├── core/
│       │   └── config.py                # pydantic-settings: LLM, embeddings, paths
│       ├── models/
│       │   └── schemas.py               # API request/response Pydantic models
│       ├── agents/
│       │   ├── state.py                 # WorkflowState TypedDict
│       │   ├── response_models.py       # Pydantic models for LLM structured outputs
│       │   ├── prompts.py               # All prompt strings as module-level constants
│       │   ├── nodes.py                 # LangGraph node functions (one per stage)
│       │   └── graph.py                 # StateGraph definition, edges, compile()
│       ├── services/
│       │   ├── llm_service.py           # get_llm() factory
│       │   ├── session_registry.py      # SQLite session/concept/story persistence
│       │   ├── document_parser.py       # PDF and DOCX text extraction
│       │   ├── vector_store.py          # FAISS index build/query, thread-safe cache
│       │   ├── export_builder.py        # Approved stories → formatted .docx
│       │   └── jira_client.py           # Jira REST API v3 issue creation
│       └── api/v1/
│           ├── router.py                # Aggregates chat + sessions routers
│           ├── chat.py                  # Workflow lifecycle endpoints
│           └── sessions.py              # Session history CRUD endpoints
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts                   # Vite + path alias (@/) + proxy /api → :8000
│   ├── tailwind.config.js               # Custom light-theme color tokens (Inter, indigo accent)
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx                     # React root mount
│       ├── App.tsx                      # QueryClientProvider wrapper
│       ├── index.css                    # Tailwind directives + CSS variables
│       ├── types/index.ts               # All TypeScript interfaces
│       ├── api/
│       │   ├── client.ts                # Axios instance (base URL)
│       │   ├── chat.ts                  # Workflow API calls (supports multiple supporting files)
│       │   └── sessions.ts              # Session history API calls (list, get, delete)
│       ├── store/session.ts             # Zustand store (session + UI state + diff snapshot)
│       ├── utils/storyDiff.ts           # Field-level diff helpers for refinement highlights
│       ├── hooks/usePolling.ts          # 2500ms status polling hook
│       ├── pages/Home.tsx               # Layout orchestrator + status router
│       └── components/
│           ├── Sidebar/                 # Session history navigation + per-session delete
│           ├── UploadScreen/            # PRD dropzone + multi-file supporting-doc dropzone (up to 5)
│           ├── ProcessingScreen/        # Animated spinner while graph runs
│           ├── ClarificationPanel/      # Question forms grouped by concept (incl. Others option)
│           ├── StoryReviewPanel/        # Master-detail: sidebar list + editable story card
│           ├── ExportPanel/             # Master-detail: sidebar list + read-only card + Jira
│           ├── SessionViewer/           # Master-detail: sidebar list + read-only past session
│           └── ui/
│               ├── StoryCard.tsx        # Shared story card (editable or read-only, diff highlights)
│               └── StoryListSidebar.tsx # Shared story list sidebar with change indicators
└── data/                                # Created at runtime (git-ignored)
    ├── uploads/{session_id}/            # Raw uploaded files + optional FAISS index
    │   ├── {original_prd_filename}
    │   ├── supporting_0.{ext}           # Optional supporting doc 1
    │   ├── supporting_1.{ext}           # Optional supporting doc 2  (up to 5)
    │   └── supporting_index/            # Per-session FAISS index (rag mode only)
    ├── artifacts/{session_id}/          # Generated output files
    │   └── user_stories.docx
    └── story_draft.db                   # SQLite database
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (React + TypeScript)                                        │
│                                                                      │
│  ┌──────────┐  ┌───────────────────────┐  ┌──────────────────────┐  │
│  │ Sidebar  │  │  Active Workflow       │  │  Past Session Viewer │  │
│  │(history) │  │  UploadScreen          │  │  (master-detail,     │  │
│  │+ delete  │  │  ProcessingScreen      │  │   read-only, from DB)│  │
│  │  button  │  │  ClarificationPanel    │  └──────────────────────┘  │
│  │          │  │  StoryReviewPanel      │                            │
│  │          │  │  ExportPanel           │                            │
│  └──────────┘  └───────────────────────┘                            │
│         │              │  polls /status every 2500ms                 │
└─────────┼──────────────┼──────────────────────────────────────────── ┘
          │              │
          ▼              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FastAPI  (main.py)                                                  │
│                                                                      │
│  POST /chat/start          → saves file(s), starts graph BG task    │
│  GET  /chat/status/{id}    → reads LangGraph checkpoint             │
│  POST /chat/review/clarification/{id} → injects answers, resumes   │
│  POST /chat/review/stories/{id}       → injects edits, resumes     │
│  GET  /chat/artifact/{id}  → streams DOCX FileResponse             │
│  POST /chat/jira/{id}      → calls Jira REST API v3                │
│  GET  /sessions            → lists SQLite sessions                  │
│  GET  /sessions/{id}       → session detail + stories              │
│  DELETE /sessions/{id}     → delete session + files from disk      │
└────────────────────┬────────────────────────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │   LangGraph Graph   │
          │                     │
          │  SqliteSaver        │◄──── data/story_draft.db
          │  (checkpointer)     │      (shared with app registry)
          │                     │
          │  Nodes:             │
          │  parse_document     │◄──── LiteLLM proxy (localhost:4000)
          │  index_support_docs │◄──── FAISS + OpenAI embeddings
          │  gen_questions      │◄──── ChatOpenAI → gpt-4o
          │  clarif_review ●    │      with_structured_output()
          │  draft_stories      │◄──── parallel per concept + RAG
          │  story_review  ●    │
          │  refine_stories     │◄──── parallel per story + RAG
          │  format_for_export  │◄──── python-docx
          └──────────┬──────────┘
                     │
          ┌──────────▼──────────┐
          │  Services           │
          │                     │
          │  llm_service.py     │ → ChatOpenAI
          │  document_parser.py │ → pdfplumber / python-docx
          │  vector_store.py    │ → FAISS + OpenAIEmbeddings
          │  session_registry.py│ → SQLite (sessions/concepts/stories)
          │  export_builder.py  │ → .docx artifact
          │  jira_client.py     │ → httpx → Jira REST API v3
          └─────────────────────┘

  ● = interrupt_before node (graph pauses, waits for human input)
```

---

## LangGraph Workflow

### Graph Nodes

The complete graph is defined in `backend/app/agents/graph.py` and compiled with
`interrupt_before=["clarification_review", "story_review"]`.

```
parse_document
    │
    ▼
index_supporting_docs          ← no-op if no supporting document uploaded
    │
    ▼
generate_clarifying_questions  ← parallel per concept + optional RAG injection
    │
    ▼
[● clarification_review]  ◄── INTERRUPT 1
    │                          human submits answers via POST /review/clarification
    ▼
draft_stories                  ← parallel per concept + optional RAG injection
    │
    ▼
[● story_review]  ◄────────── INTERRUPT 2 (may repeat)
    │                          human edits stories + optional feedback
    │                          via POST /review/stories
    ├── feedback present ──► refine_stories
    │                         ├── parallel per-story refinement + RAG injection
    │                         └── additive phase (new stories from feedback)
    │                              │
    │                              └──────► story_review  (loop)
    │
    └── feedback empty ───► format_for_export
                                  │
                                  ▼
                                 END
```

### Graph Nodes (table)

| Node | Stage | LLM Call | Output Model | Status After |
|------|-------|----------|--------------|-------------|
| `parse_document` | 1 | Yes (1 or N via map-reduce) | `ConceptNodeListOutput` | `processing` |
| `index_supporting_docs` | 1b | Yes — 1 LLM call per doc (summarisation, parallel) + optional FAISS build | `DocumentSummaryOutput` | `processing` |
| `generate_clarifying_questions` | 2 | Yes — one call per concept, parallel | `ClarifyingQuestionsOutput` | `awaiting_clarification` |
| `clarification_review` | 3 | No (interrupt) | — | `processing` |
| `draft_stories` | 4 | Yes — one call per concept, parallel | `UserStoryListOutput` | `awaiting_review` |
| `story_review` | 5 | No (interrupt) | — | `processing` |
| `refine_stories` | 6 | Yes — one call per story, parallel + additive call | `UserStoryListOutput` | `awaiting_review` |
| `format_for_export` | 7 | No | — | `complete` |

**Node details:**

`parse_document`
: Reads the uploaded PRD from `data/uploads/{session_id}/`. Extracts structured text via
`document_parser.py` — tables are preserved as GitHub-flavored markdown; DOCX headings become
`#` markers for semantic chunking. For documents ≤ `max_doc_chars` (default 80 000 chars) a
single LLM call is made with `PARSE_DOCUMENT_PROMPT`. For larger documents a map-reduce
strategy is used: sections are split at heading boundaries, each chunk is processed
independently (MAP), then a `MERGE_CONCEPTS_PROMPT` call deduplicates the combined list
(REDUCE).

`index_supporting_docs`
: Processes all uploaded supporting documents (0–5) in four steps. **(1) Parallel extraction**
— `extract_text()` is called concurrently for each file. **(2) Threshold decision** — total
raw character count across all docs is compared to `max_supporting_full_context_chars`
(default 25 000): below → `"full"` mode, above → `"rag"` mode. **(3) Parallel summarisation**
— one LLM call per doc using `SUMMARISE_SUPPORTING_DOC_PROMPT` (each doc truncated to
`max_doc_chars` before the call); summaries are 200–400 words and focus exclusively on domain
knowledge relevant to story writing. **(4) RAG index (rag mode only)** — raw text from all
docs is concatenated and indexed into a single merged FAISS store at
`data/uploads/{session_id}/supporting_index/`. Summaries are always written to
`WorkflowState.supporting_summaries`; FAISS index path to `supporting_index_path` only in
rag mode. Fully non-fatal — any per-doc failure is skipped; the workflow continues with
whatever context was successfully collected.

`generate_clarifying_questions`
: Fires one focused LLM call per concept **in parallel** (up to `MAX_PARALLEL_LLM_CALLS = 10`
threads). Each call receives only its own concept's description, keeping prompts small.
Supporting context is injected via `_inject_supporting_context`: summaries are always
prepended; in `"rag"` mode, up to 4 retrieved FAISS chunks are additionally appended.
The prompt instructs the LLM to **skip questions whose answers are already provided by the
supporting documents** — so question count adapts: 3–8 per concept (minimum 3 when context
covers several targets, up to 8 when context is absent or leaves many gaps). Sets status to
`awaiting_clarification`.

`clarification_review` *(interrupt)*
: LangGraph pauses **before** this node body runs. The frontend renders all questions grouped
by concept. `multiple_choice` and `multiple_select` questions include an "Others" option that
reveals a free-text input. When the user submits, `POST /review/clarification/{thread_id}`
injects `clarification_answers` into state and resumes the thread.

`draft_stories`
: Fires one LLM call per concept **in parallel**. Each call receives only that concept and its
own clarification answers. Supporting context (summaries + optional RAG chunks) is injected
per call via the same `_inject_supporting_context` helper, grounding stories in domain
knowledge from the supporting documents. Produces 1–3 INVEST-compliant `UserStory` objects
per concept. Sets status to `awaiting_review`.

`story_review` *(interrupt)*
: LangGraph pauses before this node. The frontend renders a master-detail layout: a sidebar
story list on the left and an inline-editable `StoryCard` on the right. After a refinement
cycle, changed sections are highlighted in amber with auto-expanded collapsible sections; a
dismissible LLM-generated change summary banner appears at the top of each card. New stories
added by additive refinement are highlighted in green.

`refine_stories`
: **Parallel phase** — one LLM call per story using the full feedback text. Supporting context
(summaries + optional RAG chunks, queried with epic + story title + description) is injected
per call. Original `id` and `concept_id` are always restored after each call so frontend diff
lookups remain stable. **Additive phase** — a second single LLM call (`REFINE_ADDITIVE_PROMPT`)
creates any wholly new stories requested by the feedback; new stories are appended after the
refined list. `refinement_feedback` is cleared to `None` after completion.

`format_for_export`
: Calls `export_builder.build_docx()` to generate a Word document at
`data/artifacts/{session_id}/user_stories.docx`. Saves stories to the SQLite `stories` table.
Marks the session complete (`has_artifacts = 1`).

### Interrupt Points

Both interrupts follow the same pattern:

```
Graph running in BackgroundTask
        │
        ▼
  interrupt_before=["node_name"]
        │
  Graph pauses, saves checkpoint to SQLite
        │
  GET /status polls → returns current status
        │
  Frontend renders input UI
        │
  User submits → POST /review/...
        │
  graph.update_state(config, {...}, as_node="node_name")
        │
  BackgroundTask: graph.stream(None, config)  ← resumes from checkpoint
        │
  Node body executes with injected state
        │
  Graph continues to next node
```

### Refinement Loop

The conditional edge after `story_review` is implemented by `route_after_story_review()`:

```python
def route_after_story_review(state: WorkflowState) -> str:
    feedback = state.get("refinement_feedback") or ""
    if feedback.strip():
        return "refine_stories"
    return "format_for_export"
```

The loop can repeat indefinitely. Each cycle preserves the human's manual field edits because
the `/review/stories` endpoint sends back the full edited story list before resuming.

### WorkflowState

Defined in `backend/app/agents/state.py`:

```python
class WorkflowState(TypedDict):
    # Session identity
    session_id: str           # Stable UUID, filesystem + DB key
    thread_id: str            # LangGraph config key (same as session_id)
    filename: str             # Original uploaded PRD filename

    # Stage data
    raw_text: str             # Full extracted text from PRD
    concept_nodes: list[dict] # [{id, title, description}, ...]
    clarifying_questions: list[dict]  # [{concept_id, question_text,
                                      #   question_type, options?}, ...]
    clarification_answers: list[dict] # [{concept_id, question_text, answer}, ...]
    stories: list[dict]       # list of UserStory.model_dump()

    # Workflow control
    refinement_feedback: Optional[str]  # None/empty → approve; non-empty → refine
    status: str               # processing | awaiting_clarification |
                              # awaiting_review | complete | error
    error_message: Optional[str]
    artifact_path: Optional[str]

    # Supporting documents (optional multi-upload)
    supporting_doc_paths: list[str]         # Raw upload paths — consumed by index_supporting_docs
    supporting_filenames: list[str]         # Original filenames for display
    supporting_summaries: list[str]         # LLM-generated summary per doc (200–400 words each)
    supporting_context_mode: Optional[str]  # "full" | "rag" | None (None = no supporting docs)
    supporting_index_path: Optional[str]    # Merged FAISS index dir; only set in "rag" mode
```

All state values are plain Python types because LangGraph's `SqliteSaver` serialises state to
JSON. Pydantic models are used only at the LLM boundary and immediately `.model_dump()`'d.

---

## Document Ingestion

`backend/app/services/document_parser.py`

### Extraction pipeline

```
Uploaded file
      │
      ├── .pdf  → pdfplumber
      │             ├── find_tables() per page → bounding boxes
      │             ├── page.filter(not_in_table) → clean prose text
      │             └── table.extract() → GFM markdown table  (| col | col |)
      │             Pages separated by --- dividers
      │
      └── .docx → python-docx (raw XML traversal, doc.element.body.iterchildren())
                    ├── w:p (paragraph)
                    │     ├── Heading style → # / ## / ### markers
                    │     └── Body text → plain paragraph
                    ├── w:tbl (table) → GFM markdown table
                    └── w:sdt (content control) → recurses into w:sdtContent
```

The same `extract_text()` function is used for both the PRD and the optional supporting
document, so all supported formats work for both upload slots.

### Large-document strategy

For documents exceeding `max_doc_chars` (default 80 000 chars, ~60 pages):

```
extract_sections(raw_text)          ← splits at # heading boundaries
      │
      ├── bin sections into chunks ≤ max_doc_chars/2 each
      │
      ├── MAP: PARSE_DOCUMENT_PROMPT per chunk → list[ConceptNode] per chunk
      │
      └── REDUCE: MERGE_CONCEPTS_PROMPT → deduplicated list[ConceptNode]
                  (falls back to unmerged flat list if reduce LLM call fails)
```

**Upload size limit:** Files larger than `max_upload_size_mb` (default 20 MB) are rejected
at `POST /chat/start` with HTTP 413 before the file is saved to disk.

**Supported formats:** `.pdf`, `.docx`

**Storage location:** `data/uploads/{session_id}/{filename}`

---

## Supporting Documents & RAG

`backend/app/services/vector_store.py`

Users can optionally upload up to **5 supporting documents** (PDF or DOCX) alongside the PRD
— technical specs, design docs, architecture decision records, domain glossaries, etc. These
are processed by `index_supporting_docs` before the first interrupt so their knowledge is
available to all downstream LLM calls.

### Hybrid context strategy

The system decides the injection mode based on total raw character count across all supporting
docs, compared to `max_supporting_full_context_chars` (default 25 000 chars, ~6 000 tokens):

| Mode | Condition | What is injected |
|------|-----------|-----------------|
| `"full"` | Total chars ≤ 25 000 | Summaries only — no FAISS, zero retrieval error |
| `"rag"` | Total chars > 25 000 | Summaries + up to 4 retrieved FAISS chunks per call |
| `None` | No supporting docs | Nothing — zero overhead |

**Summaries are always generated and always injected** (in both modes). They are 200–400 words
per document, noise-filtered to domain-relevant content only, and produced once at session
start — they add no cost to the many downstream LLM calls.

In `"rag"` mode, summaries act as a high-level map of the supporting corpus, while the
retrieved chunks provide query-specific detail. This prevents the classic RAG weakness of
"the model doesn't know what it doesn't know."

### Context injection flow

```
POST /chat/start
  └── each supporting file saved as data/uploads/{session_id}/supporting_{i}.{ext}

index_supporting_docs node
  ├── Step 1: extract_text() per doc (parallel)
  ├── Step 2: measure total chars → decide "full" or "rag" mode
  ├── Step 3: summarise each doc via LLM (parallel, truncated to max_doc_chars)
  │           → supporting_summaries written to WorkflowState
  └── Step 4 (rag only): merge all raw text → FAISS.from_texts() → save_local()
              → supporting_index_path written to WorkflowState

generate_questions / draft_stories / refine_stories
  └── _inject_supporting_context(prompt, summaries, mode, index_path, query)
        ├── always: prepend "--- Supporting Document Summaries ---" block
        └── rag mode only: query_index(k=4) → append "--- Relevant Detail ---" block

DELETE /sessions/{id}
  └── shutil.rmtree(data/uploads/{session_id})   ← removes all docs + index
```

### Summarisation prompt

`SUMMARISE_SUPPORTING_DOC_PROMPT` instructs the LLM to produce a 200–400 word summary
covering only: core purpose and scope, key domain entities and relationships, business rules
and constraints, technical requirements, and important terminology. Boilerplate, revision
history, and formatting instructions are explicitly excluded.

### Chunking strategy (rag mode)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Chunk size | 800 chars (~200 tokens) | Fits within chunk without losing context |
| Chunk overlap | 120 chars | Prevents concepts split at chunk boundaries |
| Retrieved chunks (k) | 4 | ~800 token overhead per call — bounded and predictable |

### Token budget per LLM call (worst case — 3 docs)

| Component | Full mode | RAG mode |
|-----------|----------|---------|
| Summaries (3 × ~400 words) | ~1 800 tokens | ~1 800 tokens |
| Retrieved chunks (k=4) | — | ~800 tokens |
| **Total overhead** | **~1 800 tokens** | **~2 600 tokens** |

### In-memory cache

`vector_store.py` maintains a module-level `dict[index_path → FAISS]` with a
`threading.Lock` and **double-checked locking** — the fast path reads without a lock; the
slow path acquires the lock, double-checks, and loads from disk on miss. The index survives
server restarts and is never rebuilt more than once per session.

### Query construction

| Call site | Query |
|-----------|-------|
| `_generate_questions_for_concept` | `{concept.title} + {concept.description[:200]}` |
| `_draft_one_concept` | `{concept.title} + {concept.description[:200]}` |
| `_refine_one_story` | `{epic_title} + {story.title} + {detailed_description[:150]}` |

### Context-aware question reduction

`GENERATE_QUESTIONS_PROMPT` instructs the LLM to check each of the 10 coverage targets
against the injected summaries before generating a question. If a target is already clearly
answered by the supporting documents, that question is skipped. This means question count is
**adaptive**: 3–8 per concept rather than a fixed minimum — fewer when supporting docs are
rich, more when they are absent or leave gaps.

---

## LLM & Embeddings Service

`backend/app/services/llm_service.py`

```python
def get_llm() -> ChatOpenAI:
    """LangChain ChatOpenAI pointed at a LiteLLM proxy (localhost:4000)."""
```

The LLM is accessed through a **LiteLLM proxy** running locally at `localhost:4000`, which
means you can swap the underlying model (GPT-4o, Claude, Llama, etc.) by changing the proxy
config without touching application code.

Embeddings use `OpenAIEmbeddings` pointed at `EMBEDDING_BASE_URL` (default `localhost:11434`,
compatible with Ollama and any OpenAI-compatible endpoint).

All LLM calls within parallel workers call `get_llm()` to create a fresh `ChatOpenAI`
instance per thread — `httpx` clients are not thread-safe when shared.

**Prompt discipline:** Every prompt string lives in `prompts.py` as a module-level constant.
No prompt text appears inline in node functions.

---

## Structured LLM Outputs

All LLM calls use `llm.with_structured_output(PydanticModel)` — raw text is never parsed.

```python
structured_llm = get_llm().with_structured_output(ConceptNodeListOutput)
result = structured_llm.invoke([SystemMessage(...), HumanMessage(...)])
```

**Wrapper pattern:** LLMs cannot reliably return bare JSON arrays. Every list output is
wrapped in a container model:

```python
class ConceptNodeListOutput(BaseModel):
    concepts: list[ConceptNode]

class UserStoryListOutput(BaseModel):
    stories: list[UserStory]
```

**Output models** (`backend/app/agents/response_models.py`):

| Model | Used by node | Key fields |
|-------|-------------|------------|
| `ConceptNodeListOutput` | `parse_document`, `_map_reduce_concepts` | `concepts: list[ConceptNode]` |
| `ClarifyingQuestionsOutput` | `generate_clarifying_questions` | `questions: list[ClarifyingQuestion]` |
| `UserStoryListOutput` | `draft_stories`, `refine_stories`, `_draft_additional_stories` | `stories: list[UserStory]` |
| `DocumentSummaryOutput` | `index_supporting_docs` (`_summarise_one`) | `summary: str` |

**`ClarifyingQuestion.question_type`** supports four values:

| Type | UI control | Notes |
|------|-----------|-------|
| `open` | Textarea | Free-text answers (latency SLAs, scale targets) |
| `yes_no` | Pill toggle (Yes / No) | Binary capability confirmations |
| `multiple_choice` | Radio pill list (pick one) + "Others" free-text | Mutually exclusive choices |
| `multiple_select` | Checkbox pill list (pick all) + "Others" free-text | Multi-role access, multi-action outcomes |

`multiple_choice` and `multiple_select` questions always include an **"Others"** option. When
selected, a free-text input is revealed so the user can enter a custom answer not covered by
the generated options. The typed value replaces "Others" in `clarification_answers`.

**`UserStory`** key fields:

| Field | Type | Notes |
|-------|------|-------|
| `id` | `str` (UUID) | Stable across refinement cycles — restored by `_refine_one_story` |
| `concept_id` | `str` | Links story back to its source concept |
| `change_summary` | `Optional[str]` | LLM-generated 1–3 sentence summary of what changed in a refinement pass; `null` for initial drafts and unchanged stories |
| `story_points_estimate` | `int` | Fibonacci: 1/2/3/5/8/13 |
| `priority` | `"High"/"Medium"/"Low"` | |

---

## Persistence Layer

### SQLite Registry

`data/story_draft.db` is shared between the application registry (custom tables) and
LangGraph's `SqliteSaver` checkpointer (its own internal tables). They coexist safely
in the same file.

**Application tables:**

```sql
CREATE TABLE sessions (
    session_id    TEXT PRIMARY KEY,
    thread_id     TEXT NOT NULL,
    filename      TEXT NOT NULL,
    created_at    TEXT NOT NULL,        -- ISO 8601 UTC
    updated_at    TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'processing',
    has_artifacts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE concepts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL,
    concept_json  TEXT NOT NULL         -- JSON-serialised ConceptNode dict
);

CREATE TABLE stories (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL,
    story_json    TEXT NOT NULL         -- JSON-serialised UserStory dict
);
```

**Write points:**
- `sessions` row created at `POST /chat/start` (before graph runs)
- `stories` rows written at `format_for_export` after approval
- `has_artifacts = 1` set at `format_for_export`
- All three tables deleted by `DELETE /sessions/{id}`

### File Artifacts

```
data/
├── uploads/
│   └── {session_id}/
│       ├── {original_prd_filename}         ← saved on POST /chat/start
│       ├── supporting_0.{ext}              ← optional supporting doc 1
│       ├── supporting_1.{ext}              ← optional supporting doc 2 (up to 5)
│       └── supporting_index/               ← merged FAISS index (rag mode only)
│           ├── index.faiss
│           └── index.pkl
└── artifacts/
    └── {session_id}/
        └── user_stories.docx               ← generated by format_for_export node
```

Both the `uploads/{session_id}` and `artifacts/{session_id}` directories are removed when a
session is deleted via `DELETE /sessions/{id}`.

### LangGraph Checkpoints

`SqliteSaver` persists the full `WorkflowState` + execution metadata after every node
completes. This means:

- **Interrupted graphs survive process restarts** — checkpoint is in SQLite, not memory
- `GET /status/{thread_id}` reads the latest checkpoint via `graph.get_state(config)` —
  no workflow state is held in FastAPI memory
- Resuming after interrupt calls `graph.stream(None, config)` — state reloaded automatically

---

## API Reference

All endpoints are prefixed `/api/v1`.

### Workflow Endpoints (`/chat`)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/chat/start` | `multipart/form-data: file, supporting_files[]?` | Upload PRD (required) + up to 5 optional supporting docs, register session, start graph |
| `GET` | `/chat/status/{thread_id}` | — | Poll current checkpoint state |
| `POST` | `/chat/review/clarification/{thread_id}` | `{answers: [{concept_id, question_text, answer}]}` | Inject clarification answers, resume graph |
| `POST` | `/chat/review/stories/{thread_id}` | `{stories: [...], refinement_feedback: str}` | Inject edited stories + feedback, resume graph |
| `GET` | `/chat/artifact/{session_id}` | — | Download `user_stories.docx` |
| `POST` | `/chat/jira/{session_id}` | `{jira_url, project_key, email, api_token, story_ids}` | Create Jira tickets via REST API v3 |

**`POST /chat/start` form fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `file` | Yes | PRD — PDF or DOCX, max `MAX_UPLOAD_SIZE_MB` |
| `supporting_files` | No | Up to 5 supporting documents — PDF or DOCX; triggers summarisation + optional RAG indexing. Send as repeated form fields with the same key. |

**Status values returned by `GET /status`:**

| Value | Meaning | Frontend renders |
|-------|---------|-----------------|
| `processing` | Graph is running (LLM call in progress) | ProcessingScreen |
| `awaiting_clarification` | Graph paused at interrupt 1 | ClarificationPanel |
| `awaiting_review` | Graph paused at interrupt 2 | StoryReviewPanel |
| `complete` | DOCX generated, workflow done | ExportPanel |
| `error` | Node threw an exception | Error banner |

### Session History Endpoints (`/sessions`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sessions` | List 50 most recent sessions (ordered by `updated_at DESC`) |
| `GET` | `/sessions/{session_id}` | Session metadata + saved stories |
| `DELETE` | `/sessions/{session_id}` | Permanently delete session, stories, DB rows, and all files on disk |

`DELETE /sessions/{session_id}` removes:
- All rows in `sessions`, `concepts`, `stories` tables for that session
- `data/artifacts/{session_id}/` (DOCX)
- `data/uploads/{session_id}/` (PRD, supporting doc, FAISS index)

### Jira Mapping

| UserStory field | Jira field |
|----------------|-----------|
| `title` | `summary` |
| `role` + `want` + `benefit` | `description` (Atlassian Document Format) |
| `acceptance_criteria` | `description` → bullet list section |
| `priority` | `priority.name` (High / Medium / Low) |
| `story_points_estimate` | `story_points` custom field |
| — | `issuetype.name = "Story"` |

Auth: Basic auth with `email:api_token` base64-encoded in the `Authorization` header.

---

## Frontend Flow

```
App.tsx
└── QueryClientProvider (TanStack React Query)
    └── Home.tsx
        ├── usePolling(threadId)          ← polls /status every 2500ms when active
        ├── Sidebar                       ← session history + delete per session
        └── main content (conditional):
            ├── viewingSession?  → SessionViewer   (master-detail, read-only)
            ├── !session         → UploadScreen     (PRD + optional supporting-doc dropzones)
            ├── "processing"     → ProcessingScreen
            ├── "awaiting_clarification" → ClarificationPanel
            ├── "awaiting_review"        → StoryReviewPanel  (master-detail + diff highlights)
            ├── "complete"               → ExportPanel       (master-detail)
            └── "error"          → error banner
```

**Polling behaviour** (`hooks/usePolling.ts`):
- Interval: 2500ms
- Starts when a session is active and status is `"processing"`
- Stops immediately on any non-processing status
- 404 responses are silently ignored (graph not yet checkpointed)
- Each result calls `applyStatusPoll()` to update the Zustand store

**State management** (Zustand, `store/session.ts`):
- Holds: `session`, `conceptNodes`, `clarifyingQuestions`, `stories`, `previousStories`,
  `artifactPath`, `viewingSession`, `isSubmitting`
- `previousStories` is snapshotted from `stories` just before a refinement submit
  (only when feedback is non-empty). Cleared when status reaches `complete`.
- `computeChangedFields` / `changedSections` (`utils/storyDiff.ts`) use this snapshot to
  drive per-field diff highlighting in `StoryCard`

**Refinement change highlights** (`StoryCard.tsx`):
- After each refinement poll, `changedFieldsById` (useMemo in `StoryReviewPanel`) maps each
  story ID to its set of changed field keys
- Changed collapsible sections get an amber left border, amber dot badge, and auto-open
- A dismissible amber banner at the top of each card shows the LLM's `change_summary`
- Stories added by additive refinement (no previous version) get a green "NEW" badge and banner

**Master-detail layout** (`StoryReviewPanel`, `ExportPanel`, `SessionViewer`):
- Left: `StoryListSidebar` — compact rows with priority dot, story points, title, epic name;
  amber dot for changed stories, green badge for new stories; active row highlighted
- Right: full `StoryCard` for the selected story; navigation arrows (← N/M →) in header

**UploadScreen** (`components/UploadScreen/UploadScreen.tsx`):
- Primary dropzone (required): PRD — PDF or DOCX
- Secondary dropzone (optional, visually subordinate): supporting document
- Both zones visible simultaneously; selected files shown as dismissible chips
- "Start" button activates only when a PRD is selected; calls `startNewSession(prd, supporting?)`

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A LiteLLM proxy running at `localhost:4000` (or update `LLM_BASE_URL` in `.env`)
- An OpenAI-compatible embeddings endpoint at `localhost:11434` (Ollama, or update
  `EMBEDDING_BASE_URL`) — required for supporting-document RAG

### Backend

```bash
cd backend

# 1. Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env — set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL,
#             EMBEDDING_BASE_URL, EMBEDDING_API_KEY, EMBEDDING_MODEL

# 4. Start the server
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.
Interactive docs: `http://localhost:8000/docs`

### Frontend

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev
```

The UI will be available at `http://localhost:5173`.

---

## Configuration

All settings are in `backend/app/core/config.py` and can be overridden via `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_BASE_URL` | `http://localhost:4000` | LiteLLM proxy or OpenAI-compatible endpoint |
| `LLM_API_KEY` | `sk-litellm` | API key for the LLM proxy |
| `LLM_MODEL` | `gpt-4o` | Model name passed to the proxy |
| `LLM_TEMPERATURE` | `0.0` | Sampling temperature (0 = deterministic) |
| `EMBEDDING_BASE_URL` | `http://localhost:11434` | OpenAI-compatible embeddings endpoint (Ollama or remote) |
| `EMBEDDING_API_KEY` | `sk-litellm` | API key for embeddings endpoint |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embeddings model name |
| `UPLOAD_DIR` | `data/uploads` | Where uploaded documents and FAISS indexes are saved |
| `ARTIFACTS_DIR` | `data/artifacts` | Where generated DOCX files are saved |
| `DB_PATH` | `data/story_draft.db` | SQLite database path |
| `MAX_UPLOAD_SIZE_MB` | `20` | Maximum upload file size per file; HTTP 413 if exceeded |
| `MAX_DOC_CHARS` | `80000` | Character threshold above which map-reduce extraction is used |
| `MAX_SUPPORTING_FULL_CONTEXT_CHARS` | `25000` | Total chars across all supporting docs below which summaries alone are injected (no FAISS); above this FAISS RAG is also used |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | Allowed CORS origins |

The `data/` directory is created automatically at runtime and is git-ignored.
