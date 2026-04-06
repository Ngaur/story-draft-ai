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
7. [LLM & Embeddings Service](#llm--embeddings-service)
8. [Structured LLM Outputs](#structured-llm-outputs)
9. [Persistence Layer](#persistence-layer)
   - [SQLite Registry](#sqlite-registry)
   - [File Artifacts](#file-artifacts)
   - [LangGraph Checkpoints](#langgraph-checkpoints)
10. [API Reference](#api-reference)
11. [Frontend Flow](#frontend-flow)
12. [Getting Started](#getting-started)
13. [Configuration](#configuration)

---

## Overview

```
User uploads PDF/DOCX
        │
        ▼
  AI extracts concept nodes
        │
        ▼
  AI generates clarifying questions per concept
        │
        ▼  ◄── INTERRUPT 1: human answers questions in UI
  AI drafts user stories (1–3 per concept, batched)
        │
        ▼  ◄── INTERRUPT 2: human edits stories + optional feedback
  [feedback?] ──yes──► AI refines stories ──► back to INTERRUPT 2
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
| Embeddings | Ollama (`OllamaEmbeddings`) or OpenAI-compatible endpoint |
| Vector store | FAISS (`faiss-cpu`) — per-session index |
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
│       │   ├── llm_service.py           # get_llm() and get_embeddings() factory
│       │   ├── session_registry.py      # SQLite session/concept/story persistence
│       │   ├── document_parser.py       # PDF and DOCX text extraction
│       │   ├── export_builder.py        # Approved stories → formatted .docx
│       │   └── jira_client.py           # Jira REST API v3 issue creation
│       └── api/v1/
│           ├── router.py                # Aggregates chat + sessions routers
│           ├── chat.py                  # Workflow lifecycle endpoints
│           └── sessions.py              # Session history read endpoints
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
│       │   ├── chat.ts                  # Workflow API calls
│       │   └── sessions.ts              # Session history API calls
│       ├── store/session.ts             # Zustand store (session + UI state)
│       ├── hooks/usePolling.ts          # 2500ms status polling hook
│       ├── pages/Home.tsx               # Layout orchestrator + status router
│       └── components/
│           ├── Sidebar/                 # Session history navigation
│           ├── UploadScreen/            # Drag-and-drop file upload
│           ├── ProcessingScreen/        # Animated spinner while graph runs
│           ├── ClarificationPanel/      # Question forms grouped by concept
│           ├── StoryReviewPanel/        # Inline-editable story cards + feedback
│           ├── ExportPanel/             # Read-only stories + DOCX + Jira form
│           ├── SessionViewer/           # Read-only past session view
│           └── ui/StoryCard.tsx         # Shared story card (editable or read-only)
└── data/                                # Created at runtime (git-ignored)
    ├── uploads/{session_id}/            # Raw uploaded files
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
│  ┌──────────┐  ┌───────────────────┐  ┌────────────────────────┐   │
│  │ Sidebar  │  │  Active Workflow   │  │  Past Session Viewer   │   │
│  │(history) │  │  UploadScreen      │  │  (read-only, from DB)  │   │
│  │          │  │  ProcessingScreen  │  └────────────────────────┘   │
│  │          │  │  ClarificationPanel│                               │
│  │          │  │  StoryReviewPanel  │                               │
│  │          │  │  ExportPanel       │                               │
│  └──────────┘  └───────────────────┘                               │
│         │              │  polls /status every 2500ms                │
└─────────┼──────────────┼─────────────────────────────────────────── ┘
          │              │
          ▼              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FastAPI  (main.py)                                                  │
│                                                                      │
│  POST /chat/start          → saves file, starts graph BG task       │
│  GET  /chat/status/{id}    → reads LangGraph checkpoint             │
│  POST /chat/review/clarification/{id} → injects answers, resumes   │
│  POST /chat/review/stories/{id}       → injects edits, resumes     │
│  GET  /chat/artifact/{id}  → streams DOCX FileResponse             │
│  POST /chat/jira/{id}      → calls Jira REST API v3                │
│  GET  /sessions            → lists SQLite sessions                  │
│  GET  /sessions/{id}       → session detail + stories              │
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
          │  gen_questions      │◄──── ChatOpenAI → gpt-4o
          │  clarif_review ●    │      with_structured_output()
          │  draft_stories      │
          │  story_review  ●    │
          │  refine_stories     │
          │  format_for_export  │◄──── python-docx
          └──────────┬──────────┘
                     │
          ┌──────────▼──────────┐
          │  Services           │
          │                     │
          │  llm_service.py     │ → ChatOpenAI / OllamaEmbeddings
          │  document_parser.py │ → pypdf / docx2txt
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
generate_clarifying_questions
    │
    ▼
[● clarification_review]  ◄── INTERRUPT 1
    │                          human submits answers via POST /review/clarification
    ▼
draft_stories
    │
    ▼
[● story_review]  ◄────────── INTERRUPT 2 (may repeat)
    │                          human edits stories + optional feedback
    │                          via POST /review/stories
    ├── feedback present ──► refine_stories
    │                              │
    │                              └──────► story_review  (loop)
    │
    └── feedback empty ───► format_for_export
                                  │
                                  ▼
                                 END
```

### Graph Nodes

| Node | Stage | LLM Call | Output Model | Status After |
|------|-------|----------|--------------|-------------|
| `parse_document` | 1 | Yes (1 or N via map-reduce) | `ConceptNodeListOutput` | `processing` |
| `generate_clarifying_questions` | 2 | Yes | `ClarifyingQuestionsOutput` | `awaiting_clarification` |
| `clarification_review` | 3 | No (interrupt) | — | `processing` |
| `draft_stories` | 4 | Yes (batched, 4 concepts per call) | `UserStoryListOutput` | `awaiting_review` |
| `story_review` | 5 | No (interrupt) | — | `processing` |
| `refine_stories` | 6 | Yes | `UserStoryListOutput` | `awaiting_review` |
| `format_for_export` | 7 | No | — | `complete` |

**Node details:**

`parse_document`
: Reads the uploaded file from `data/uploads/{session_id}/`. Extracts structured text via
`document_parser.py` — tables are preserved as GitHub-flavored markdown; DOCX headings
become `#` markers for semantic chunking. For documents ≤ `max_doc_chars` (default 80 000
chars) a single LLM call is made with `PARSE_DOCUMENT_PROMPT`. For larger documents a
map-reduce strategy is used: sections are split at heading boundaries, each chunk is
processed independently (MAP), then a `MERGE_CONCEPTS_PROMPT` call deduplicates the combined
list (REDUCE). No upper cap on concept count — enumerated feature catalogs produce one
concept per feature.

`generate_clarifying_questions`
: Receives the concept nodes list. Calls the LLM with `GENERATE_QUESTIONS_PROMPT` and
`ClarifyingQuestionsOutput`. Produces 5–8 questions per concept with a mandatory type mix:
~30% `yes_no`, ~25% `multiple_choice`, ~25% `multiple_select`, ~20% `open`. Questions
reference domain-specific entity names exactly as they appear in the source document.
Sets status to `awaiting_clarification`.

`clarification_review` *(interrupt)*
: LangGraph pauses **before** this node body runs. The frontend renders all questions
grouped by concept. When the user submits answers, `POST /review/clarification/{thread_id}`
calls `graph.update_state(..., as_node="clarification_review")` to inject
`clarification_answers` into the checkpoint, then resumes the thread. An empty list `[]`
(all questions skipped) is valid — the node only errors when the key is `None` (endpoint
never called).

`draft_stories`
: Combines `concept_nodes` + answered `clarification_answers` from state. Processes concepts
in batches of 4 to avoid output-token truncation on large feature catalogs. Each batch is an
independent `DRAFT_STORIES_PROMPT` + `UserStoryListOutput` call; results are concatenated in
order. Produces 1–3 `UserStory` objects per concept (management plane and runtime plane split
into separate stories where applicable), all INVEST-compliant. Skipped questions are
surfaced as explicit assumptions. Sets status to `awaiting_review`.

`story_review` *(interrupt)*
: LangGraph pauses before this node. The frontend renders inline-editable `StoryCard`
components. The human can edit any field directly, then either:
- submit with refinement feedback → `refine_stories`
- approve (empty feedback) → `format_for_export`

`refine_stories`
: Receives the human-edited stories + `refinement_feedback` from state. Calls the LLM with
`REFINE_STORIES_PROMPT`, instructing it to apply the feedback while preserving all manual
edits. Clears `refinement_feedback` to `None` after completion, sets status back to
`awaiting_review`, and routes back to `story_review` for the next review cycle.

`format_for_export`
: Calls `export_builder.build_docx()` to generate a formatted Word document at
`data/artifacts/{session_id}/user_stories.docx`. Saves stories to the SQLite `stories` table
via `session_registry.save_stories()`. Marks the session complete (`has_artifacts = 1`).

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
    session_id: str           # Stable UUID, used as filesystem + DB key
    thread_id: str            # LangGraph config key (same value as session_id)
    filename: str             # Original uploaded filename

    raw_text: str             # Full extracted text from document
    concept_nodes: list[dict] # [{id, title, description}, ...]
    clarifying_questions: list[dict]  # [{concept_id, question_text,
                                      #   question_type, options?}, ...]
    clarification_answers: list[dict] # [{concept_id, question_text, answer}, ...]
    stories: list[dict]       # [{id, concept_id, title, role, want, benefit,
                              #   acceptance_criteria, story_points_estimate,
                              #   priority}, ...]

    refinement_feedback: Optional[str]  # None/empty → approve; non-empty → refine
    status: str               # processing | awaiting_clarification |
                              # awaiting_review | complete | error
    error_message: Optional[str]
    artifact_path: Optional[str]  # Relative path to generated .docx
```

All state values are plain Python types (not Pydantic models) because LangGraph's
`SqliteSaver` serialises state to JSON. Pydantic models are used only at the LLM boundary
and immediately `.model_dump()`'d into state.

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

Tables are preserved as GitHub-flavored markdown (`| col | col |` rows with a `| --- |`
separator after the header row) so that row/column relationships are visible to the LLM.
DOCX headings are emitted as Markdown `#` markers to enable semantic section splitting.

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

Documents with no Markdown headings fall back to fixed-size character windows.

**Upload size limit:** Files larger than `max_upload_size_mb` (default 20 MB) are rejected
at `POST /chat/start` with HTTP 413 before the file is saved to disk.

**Supported formats:** `.pdf`, `.docx`, `.doc`

**Storage location:** `data/uploads/{session_id}/{filename}`
Files are saved immediately on `POST /chat/start` before the background task starts,
so they are durably stored even if the process restarts.

---

## LLM & Embeddings Service

`backend/app/services/llm_service.py`

```python
def get_llm() -> ChatOpenAI:
    """LangChain ChatOpenAI pointed at a LiteLLM proxy (localhost:4000)."""

def get_embeddings() -> OllamaEmbeddings:
    """Ollama embeddings for local vector search (localhost:11434)."""
```

The LLM is accessed through a **LiteLLM proxy** running locally at `localhost:4000`, which
means you can swap the underlying model (GPT-4o, Claude, Llama, etc.) by changing the proxy
config — the application code never changes.

All nodes call `get_llm()` directly (not as a module-level singleton) so tests can monkeypatch
it and each request gets a fresh client with current config.

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
    concepts: list[ConceptNode]           # wrapped

class UserStoryListOutput(BaseModel):
    stories: list[UserStory]              # wrapped
```

**Output models** (`backend/app/agents/response_models.py`):

| Model | Used by node | Key fields |
|-------|-------------|------------|
| `ConceptNodeListOutput` | `parse_document`, `_map_reduce_concepts` | `concepts: list[ConceptNode]` |
| `ClarifyingQuestionsOutput` | `generate_clarifying_questions` | `questions: list[ClarifyingQuestion]` |
| `UserStoryListOutput` | `draft_stories` (per batch), `refine_stories` | `stories: list[UserStory]` |

**`ClarifyingQuestion.question_type`** supports four values:

| Type | UI control | Use case |
|------|-----------|---------|
| `open` | Textarea | Free-text answers (latency SLAs, scale targets) |
| `yes_no` | Pill toggle (Yes / No) | Binary capability confirmations |
| `multiple_choice` | Radio pill list (pick one) | Mutually exclusive choices (conflict resolution, scope level) |
| `multiple_select` | Checkbox pill list (pick all) | Multi-role access, multi-action outcomes, KPI sets |

Multiple-select answers are stored as comma-separated strings in `clarification_answers[].answer`.

---

## Persistence Layer

### SQLite Registry

`data/story_draft.db` is shared between the application registry (custom tables) and
LangGraph's `SqliteSaver` checkpointer (its own internal tables). They coexist safely
in the same file.

**Application tables:**

```sql
-- One row per session
CREATE TABLE sessions (
    session_id    TEXT PRIMARY KEY,
    thread_id     TEXT NOT NULL,
    filename      TEXT NOT NULL,
    created_at    TEXT NOT NULL,        -- ISO 8601 UTC
    updated_at    TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'processing',
    has_artifacts INTEGER NOT NULL DEFAULT 0
);

-- Snapshot of extracted concept nodes
CREATE TABLE concepts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL,
    concept_json  TEXT NOT NULL         -- JSON-serialised ConceptNode dict
);

-- Final approved stories (written at format_for_export)
CREATE TABLE stories (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL,
    story_json    TEXT NOT NULL         -- JSON-serialised UserStory dict
);
```

**LangGraph checkpointer tables** (managed automatically by `SqliteSaver`):
`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`

**Write points:**
- `sessions` row created at `POST /chat/start` (before graph runs)
- `stories` rows written at `format_for_export` after approval
- `has_artifacts = 1` set at `format_for_export`
- Status synced to `sessions.status` by the background task runner on error

### File Artifacts

```
data/
├── uploads/
│   └── {session_id}/
│       └── {original_filename}       ← saved on POST /chat/start
└── artifacts/
    └── {session_id}/
        └── user_stories.docx         ← generated by format_for_export node
```

The DOCX is built by `export_builder.build_docx()` using `python-docx`:

```
Document title: "User Stories"
│
├── Heading 1: {story.title}
├── Paragraph: "As a {role}, I want {want}, so that {benefit}."
├── Heading 2: "Acceptance Criteria"
├── Bullet list: each acceptance criterion
├── Paragraph: "Story Points: N  |  Priority: X"
└── Separator: "────────────────────────────────────────────"
    (between stories)
```

### LangGraph Checkpoints

`SqliteSaver` persists the full `WorkflowState` + execution metadata after every node
completes. This means:

- **Interrupted graphs survive process restarts** — the checkpoint is in SQLite, not memory
- `GET /status/{thread_id}` reads the latest checkpoint via `graph.get_state(config)` —
  no state is held in FastAPI memory
- Resuming after interrupt calls `graph.stream(None, config)` — LangGraph reloads state
  from the checkpoint automatically

---

## API Reference

All endpoints are prefixed `/api/v1`.

### Workflow Endpoints (`/chat`)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/chat/start` | `multipart/form-data: file` | Upload document, register session, start graph in background |
| `GET` | `/chat/status/{thread_id}` | — | Poll current checkpoint state |
| `POST` | `/chat/review/clarification/{thread_id}` | `{answers: [{concept_id, question_text, answer}]}` | Inject clarification answers, resume graph |
| `POST` | `/chat/review/stories/{thread_id}` | `{stories: [...], refinement_feedback: str}` | Inject edited stories + feedback, resume graph |
| `GET` | `/chat/artifact/{session_id}` | — | Download `user_stories.docx` |
| `POST` | `/chat/jira/{session_id}` | `{jira_url, project_key, email, api_token, story_ids}` | Create Jira tickets via REST API v3 |

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

### Jira Mapping

Stories are mapped to Jira issues as follows:

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
        ├── Sidebar                       ← session history via useQuery
        └── main content (conditional):
            ├── viewingSession?  → SessionViewer   (past session, read-only)
            ├── !session         → UploadScreen     (drag & drop)
            ├── "processing"     → ProcessingScreen (4-step progress indicator + hint pill)
            ├── "awaiting_clarification" → ClarificationPanel
            ├── "awaiting_review"        → StoryReviewPanel
            ├── "complete"               → ExportPanel
            └── "error"          → error banner
```

**Polling behaviour** (`hooks/usePolling.ts`):
- Interval: 2500ms
- Starts when a session is active and status is `"processing"`
- Stops immediately when status transitions to any non-processing value
- 404 responses (graph not yet checkpointed) are silently ignored
- On each poll result, Zustand store is updated via `applyStatusPoll()`

**State management** (Zustand, `store/session.ts`):
- Single store holds: active session, conceptNodes, clarifyingQuestions, stories,
  artifactPath, viewingSession, isSubmitting
- All API calls are encapsulated as store actions
- `reset()` clears all state for a new session

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A LiteLLM proxy running at `localhost:4000` (or update `LLM_BASE_URL` in `.env`)
- Ollama running at `localhost:11434` (for embeddings, or update `EMBEDDING_BASE_URL`)

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
# Edit .env — set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL as needed

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
| `EMBEDDING_BASE_URL` | `http://localhost:11434` | Ollama or OpenAI-compatible embeddings endpoint |
| `EMBEDDING_API_KEY` | `sk-litellm` | API key for embeddings endpoint |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embeddings model name |
| `UPLOAD_DIR` | `data/uploads` | Where uploaded documents are saved |
| `ARTIFACTS_DIR` | `data/artifacts` | Where generated DOCX files are saved |
| `DB_PATH` | `data/story_draft.db` | SQLite database path |
| `MAX_UPLOAD_SIZE_MB` | `20` | Maximum upload file size; HTTP 413 if exceeded |
| `MAX_DOC_CHARS` | `80000` | Character threshold above which map-reduce extraction is used |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | Allowed CORS origins |

The `data/` directory is created automatically at runtime and is git-ignored.
