from fastapi import APIRouter, HTTPException

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
