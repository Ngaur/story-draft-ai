from fastapi import APIRouter

from app.api.v1 import chat, sessions

router = APIRouter(prefix="/api/v1")
router.include_router(chat.router)
router.include_router(sessions.router)
