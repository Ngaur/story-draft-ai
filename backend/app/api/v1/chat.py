import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from langchain_core.runnables import RunnableConfig

from app.agents.graph import graph
from app.core.config import settings
from app.models.schemas import (
    ClarificationSubmission,
    JiraCreationRequest,
    JiraCreationResponse,
    StartSessionResponse,
    StatusResponse,
    StoryReviewSubmission,
)
from app.services.session_registry import registry

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)


def _config(thread_id: str) -> RunnableConfig:
    return {"configurable": {"thread_id": thread_id}}


def _run_graph(thread_id: str, initial_state: dict | None = None) -> None:
    """Run the graph in a background thread until the next interrupt or END.

    Pass initial_state for the very first run. Pass None to resume from a
    LangGraph checkpoint after an interrupt — passing anything other than
    None (including {}) would start a brand-new run from the entry point.
    """
    config = _config(thread_id)
    try:
        list(graph.stream(input=initial_state, config=config))
    except Exception as e:
        logger.error("Graph stream error for thread %s: %s", thread_id, e)
        # Attempt to persist error status to registry
        try:
            state = graph.get_state(config)
            if state and state.values:
                session_id = state.values.get("session_id", "")
                if session_id:
                    registry.update_status(session_id, "error")
        except Exception:
            pass


# ── Start ─────────────────────────────────────────────────────────────────────

@router.post("/start", response_model=StartSessionResponse)
async def start_session(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    supporting_files: list[UploadFile] = File(default=[]),
) -> StartSessionResponse:
    """
    Accept a PDF or DOCX upload, plus up to 5 optional supporting documents.
    Saves all files, registers the session, then runs the graph as a background task
    until the clarification_review interrupt.
    """
    session_id = str(uuid.uuid4())
    thread_id = session_id

    # Enforce file size limit before saving
    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {settings.max_upload_size_mb} MB.",
        )

    # Save main uploaded file
    upload_dir = Path(settings.upload_dir) / session_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / (file.filename or "document")
    file_path.write_bytes(content)

    # Save optional supporting documents (up to 5)
    supporting_doc_paths: list[str] = []
    supporting_filenames: list[str] = []
    for i, sup_file in enumerate(supporting_files[:5]):
        if not sup_file or not sup_file.filename:
            continue
        sup_content = await sup_file.read()
        if not sup_content:
            continue
        sup_suffix = Path(sup_file.filename).suffix or ""
        sup_dest = upload_dir / f"supporting_{i}{sup_suffix}"
        sup_dest.write_bytes(sup_content)
        supporting_doc_paths.append(str(sup_dest))
        supporting_filenames.append(sup_file.filename)

    # Register session in SQLite immediately (survives restart)
    registry.create_session(
        session_id=session_id,
        thread_id=thread_id,
        filename=file.filename or "document",
    )

    initial_state = {
        "session_id": session_id,
        "thread_id": thread_id,
        "filename": file.filename or "document",
        "raw_text": "",
        "concept_nodes": [],
        "clarifying_questions": [],
        "clarification_answers": [],
        "stories": [],
        "refinement_feedback": None,
        "status": "processing",
        "error_message": None,
        "artifact_path": None,
        "supporting_doc_paths": supporting_doc_paths,
        "supporting_filenames": supporting_filenames,
        "supporting_summaries": [],
        "supporting_context_mode": None,
        "supporting_index_path": None,
    }

    background_tasks.add_task(_run_graph, thread_id, initial_state)

    return StartSessionResponse(session_id=session_id, thread_id=thread_id, status="processing")


# ── Status polling ────────────────────────────────────────────────────────────

@router.get("/status/{thread_id}", response_model=StatusResponse)
async def get_status(thread_id: str) -> StatusResponse:
    """
    Poll the current LangGraph checkpoint for this thread.
    Returns 404 while the background task has not yet written the first checkpoint.
    """
    config = _config(thread_id)
    try:
        state = graph.get_state(config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not state or not state.values:
        raise HTTPException(status_code=404, detail="Session not found — still initializing")

    v = state.values
    return StatusResponse(
        thread_id=thread_id,
        session_id=v.get("session_id", ""),
        status=v.get("status", "processing"),
        concept_nodes=v.get("concept_nodes") or None,
        clarifying_questions=v.get("clarifying_questions") or None,
        stories=v.get("stories") or None,
        artifact_path=v.get("artifact_path"),
        error_message=v.get("error_message"),
    )


# ── Clarification review ──────────────────────────────────────────────────────

@router.post("/review/clarification/{thread_id}")
async def submit_clarification(
    thread_id: str,
    body: ClarificationSubmission,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Inject human clarification answers into the paused graph, then resume.
    The graph will run draft_stories and pause again at story_review.
    """
    config = _config(thread_id)
    state = graph.get_state(config)
    if not state or not state.values:
        raise HTTPException(status_code=404, detail="Session not found")

    # Include status="processing" so any poll fired between this update and
    # the background task running sees the correct status and does not push
    # the frontend back to the ClarificationPanel.
    graph.update_state(
        config,
        {
            "clarification_answers": [a.model_dump() for a in body.answers],
            "status": "processing",
        },
    )
    background_tasks.add_task(_run_graph, thread_id, None)
    return {"status": "processing"}


# ── Story review ──────────────────────────────────────────────────────────────

@router.post("/review/stories/{thread_id}")
async def submit_story_review(
    thread_id: str,
    body: StoryReviewSubmission,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Inject human-edited stories + optional refinement feedback, then resume.

    If refinement_feedback is empty → graph routes to format_for_export → complete.
    If refinement_feedback is non-empty → graph routes to refine_stories → loops.
    """
    config = _config(thread_id)
    state = graph.get_state(config)
    if not state or not state.values:
        raise HTTPException(status_code=404, detail="Session not found")

    # Include status="processing" so polls fired between this update and
    # the background task do not push the frontend back to StoryReviewPanel.
    graph.update_state(
        config,
        {
            "stories": body.stories,
            "refinement_feedback": body.refinement_feedback or None,
            "status": "processing",
        },
    )
    background_tasks.add_task(_run_graph, thread_id, None)
    return {"status": "processing"}


# ── Artifact download ─────────────────────────────────────────────────────────

@router.get("/artifact/{session_id}")
async def download_artifact(session_id: str) -> FileResponse:
    """Stream the generated DOCX file for this session."""
    session = registry.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session["has_artifacts"]:
        raise HTTPException(status_code=404, detail="Artifact not ready yet")

    artifact_path = Path(settings.artifacts_dir) / session_id / "user_stories.docx"
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail="Artifact file missing")

    return FileResponse(
        path=str(artifact_path),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename="user_stories.docx",
    )


# ── Jira integration ──────────────────────────────────────────────────────────

@router.post("/jira/{session_id}", response_model=JiraCreationResponse)
async def create_jira_tickets(
    session_id: str,
    body: JiraCreationRequest,
) -> JiraCreationResponse:
    """Create Jira tickets for selected stories in this session."""
    from app.services.jira_client import create_issues

    all_stories = registry.get_stories(session_id)
    if not all_stories:
        raise HTTPException(status_code=404, detail="No stories found for this session")

    selected = [s for s in all_stories if s.get("id") in body.story_ids]
    if not selected:
        raise HTTPException(status_code=400, detail="No matching stories found for provided story_ids")

    return await create_issues(
        jira_url=body.jira_url,
        project_key=body.project_key,
        email=body.email,
        api_token=body.api_token,
        stories=selected,
    )
