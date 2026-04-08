import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.models.schemas import SessionDetail, SessionRecord
from app.services.session_registry import registry

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[SessionRecord])
async def list_sessions() -> list[SessionRecord]:
    """Return the 50 most recent sessions ordered by last update."""
    rows = registry.list_sessions()
    return [SessionRecord(**r) for r in rows]


@router.get("/{session_id}", response_model=SessionDetail)
async def get_session(session_id: str) -> SessionDetail:
    """Return session metadata and all saved stories for a past session."""
    session = registry.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    stories = registry.get_stories(session_id)
    return SessionDetail(**session, stories=stories)


@router.delete("/{session_id}", status_code=204)
async def delete_session(session_id: str) -> None:
    """Permanently delete a session, its stories, and its artifact files."""
    deleted = registry.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")

    # Remove artifact directory (DOCX + any other files) if it exists
    artifact_dir = Path(settings.artifacts_dir) / session_id
    if artifact_dir.exists():
        shutil.rmtree(artifact_dir, ignore_errors=True)

    # Remove upload directory (original + supporting doc + FAISS index) if it exists
    upload_dir = Path(settings.upload_dir) / session_id
    if upload_dir.exists():
        shutil.rmtree(upload_dir, ignore_errors=True)
