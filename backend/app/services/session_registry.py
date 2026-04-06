import json
import os
import sqlite3
import threading
from datetime import datetime, timezone


class SessionRegistry:
    """Thread-safe SQLite registry for sessions, concepts, and stories."""

    def __init__(self, db_path: str):
        self._db_path = db_path
        self._lock = threading.Lock()
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self._db_path, check_same_thread=False)

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _init_db(self) -> None:
        with self._lock:
            conn = self._conn()
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id   TEXT PRIMARY KEY,
                    thread_id    TEXT NOT NULL,
                    filename     TEXT NOT NULL,
                    created_at   TEXT NOT NULL,
                    updated_at   TEXT NOT NULL,
                    status       TEXT NOT NULL DEFAULT 'processing',
                    has_artifacts INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS concepts (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id   TEXT NOT NULL,
                    concept_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS stories (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id   TEXT NOT NULL,
                    story_json   TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_concepts_session ON concepts(session_id);
                CREATE INDEX IF NOT EXISTS idx_stories_session  ON stories(session_id);
            """)
            conn.commit()
            conn.close()

    def create_session(self, session_id: str, thread_id: str, filename: str) -> None:
        with self._lock:
            now = self._now()
            conn = self._conn()
            conn.execute(
                "INSERT OR IGNORE INTO sessions "
                "(session_id, thread_id, filename, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (session_id, thread_id, filename, now, now),
            )
            conn.commit()
            conn.close()

    def update_status(self, session_id: str, status: str) -> None:
        with self._lock:
            conn = self._conn()
            conn.execute(
                "UPDATE sessions SET status=?, updated_at=? WHERE session_id=?",
                (status, self._now(), session_id),
            )
            conn.commit()
            conn.close()

    def save_concepts(self, session_id: str, concepts: list[dict]) -> None:
        with self._lock:
            conn = self._conn()
            conn.execute("DELETE FROM concepts WHERE session_id=?", (session_id,))
            conn.executemany(
                "INSERT INTO concepts (session_id, concept_json) VALUES (?, ?)",
                [(session_id, json.dumps(c)) for c in concepts],
            )
            conn.execute(
                "UPDATE sessions SET updated_at=? WHERE session_id=?",
                (self._now(), session_id),
            )
            conn.commit()
            conn.close()

    def save_stories(self, session_id: str, stories: list[dict]) -> None:
        with self._lock:
            conn = self._conn()
            conn.execute("DELETE FROM stories WHERE session_id=?", (session_id,))
            conn.executemany(
                "INSERT INTO stories (session_id, story_json) VALUES (?, ?)",
                [(session_id, json.dumps(s)) for s in stories],
            )
            conn.execute(
                "UPDATE sessions SET updated_at=? WHERE session_id=?",
                (self._now(), session_id),
            )
            conn.commit()
            conn.close()

    def mark_complete(self, session_id: str) -> None:
        with self._lock:
            conn = self._conn()
            conn.execute(
                "UPDATE sessions SET status='complete', has_artifacts=1, updated_at=? "
                "WHERE session_id=?",
                (self._now(), session_id),
            )
            conn.commit()
            conn.close()

    def list_sessions(self) -> list[dict]:
        with self._lock:
            conn = self._conn()
            rows = conn.execute(
                "SELECT session_id, thread_id, filename, created_at, updated_at, "
                "status, has_artifacts FROM sessions ORDER BY updated_at DESC LIMIT 50"
            ).fetchall()
            conn.close()
        return [
            {
                "session_id": r[0],
                "thread_id": r[1],
                "filename": r[2],
                "created_at": r[3],
                "updated_at": r[4],
                "status": r[5],
                "has_artifacts": bool(r[6]),
            }
            for r in rows
        ]

    def get_session(self, session_id: str) -> dict | None:
        with self._lock:
            conn = self._conn()
            row = conn.execute(
                "SELECT session_id, thread_id, filename, created_at, updated_at, "
                "status, has_artifacts FROM sessions WHERE session_id=?",
                (session_id,),
            ).fetchone()
            conn.close()
        if not row:
            return None
        return {
            "session_id": row[0],
            "thread_id": row[1],
            "filename": row[2],
            "created_at": row[3],
            "updated_at": row[4],
            "status": row[5],
            "has_artifacts": bool(row[6]),
        }

    def get_stories(self, session_id: str) -> list[dict]:
        with self._lock:
            conn = self._conn()
            rows = conn.execute(
                "SELECT story_json FROM stories WHERE session_id=?", (session_id,)
            ).fetchall()
            conn.close()
        return [json.loads(r[0]) for r in rows]


from app.core.config import settings

registry = SessionRegistry(settings.db_path)
