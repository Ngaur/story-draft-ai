from typing import Optional
from pydantic import BaseModel


# ── Request bodies ────────────────────────────────────────────────────────────

class ClarificationAnswer(BaseModel):
    concept_id: str
    question_text: str
    answer: str


class ClarificationSubmission(BaseModel):
    answers: list[ClarificationAnswer]


class StoryReviewSubmission(BaseModel):
    stories: list[dict]
    refinement_feedback: str = ""


class JiraCreationRequest(BaseModel):
    jira_url: str
    project_key: str
    email: str
    api_token: str
    story_ids: list[str]


# ── Response bodies ───────────────────────────────────────────────────────────

class StartSessionResponse(BaseModel):
    session_id: str
    thread_id: str
    status: str


class StatusResponse(BaseModel):
    thread_id: str
    session_id: str
    status: str
    concept_nodes: Optional[list[dict]] = None
    clarifying_questions: Optional[list[dict]] = None
    stories: Optional[list[dict]] = None
    artifact_path: Optional[str] = None
    error_message: Optional[str] = None


class SessionRecord(BaseModel):
    session_id: str
    thread_id: str
    filename: str
    created_at: str
    updated_at: str
    status: str
    has_artifacts: bool


class SessionDetail(BaseModel):
    session_id: str
    thread_id: str
    filename: str
    created_at: str
    updated_at: str
    status: str
    has_artifacts: bool
    stories: list[dict]


class JiraIssueResult(BaseModel):
    story_id: str
    issue_key: Optional[str] = None
    issue_url: Optional[str] = None
    error: Optional[str] = None


class JiraCreationResponse(BaseModel):
    created_issues: list[JiraIssueResult]
    failed_issues: list[JiraIssueResult]
