import base64
import logging
from typing import Optional

import httpx

from app.models.schemas import JiraCreationResponse, JiraIssueResult

logger = logging.getLogger(__name__)


def _build_adf_description(story: dict) -> dict:
    """
    Convert story fields to Atlassian Document Format (ADF) JSON.
    https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
    """
    role = story.get("role", "")
    want = story.get("want", "")
    benefit = story.get("benefit", "")
    acceptance_criteria = story.get("acceptance_criteria", [])
    story_points = story.get("story_points_estimate", "?")
    priority = story.get("priority", "?")

    statement_text = f"As a {role}, I want {want}, so that {benefit}."

    bullet_items = [
        {
            "type": "listItem",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": ac}],
                }
            ],
        }
        for ac in acceptance_criteria
    ]

    return {
        "version": 1,
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": statement_text}],
            },
            {
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": "Acceptance Criteria"}],
            },
            {
                "type": "bulletList",
                "content": bullet_items,
            },
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": f"Story Points: {story_points}   |   Priority: {priority}",
                        "marks": [{"type": "em"}],
                    }
                ],
            },
        ],
    }


async def create_issues(
    jira_url: str,
    project_key: str,
    email: str,
    api_token: str,
    stories: list[dict],
) -> JiraCreationResponse:
    """
    Create Jira issues via REST API v3 for each story dict.

    Auth: Basic auth (email:api_token base64-encoded).
    Maps UserStory fields to Jira issue fields.
    """
    token = base64.b64encode(f"{email}:{api_token}".encode()).decode()
    headers = {
        "Authorization": f"Basic {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    api_url = f"{jira_url.rstrip('/')}/rest/api/3/issue"

    created: list[JiraIssueResult] = []
    failed: list[JiraIssueResult] = []

    async with httpx.AsyncClient(timeout=30) as client:
        for story in stories:
            story_id = story.get("id", "")
            payload = {
                "fields": {
                    "project": {"key": project_key},
                    "summary": story.get("title", "Untitled Story"),
                    "description": _build_adf_description(story),
                    "issuetype": {"name": "Story"},
                    "priority": {"name": story.get("priority", "Medium")},
                }
            }
            try:
                resp = await client.post(api_url, json=payload, headers=headers)
                if resp.status_code in (200, 201):
                    data = resp.json()
                    issue_key = data.get("key", "")
                    issue_url = f"{jira_url.rstrip('/')}/browse/{issue_key}"
                    created.append(
                        JiraIssueResult(
                            story_id=story_id,
                            issue_key=issue_key,
                            issue_url=issue_url,
                        )
                    )
                else:
                    failed.append(
                        JiraIssueResult(
                            story_id=story_id,
                            error=f"HTTP {resp.status_code}: {resp.text[:200]}",
                        )
                    )
            except Exception as e:
                logger.error("Jira issue creation failed for story %s: %s", story_id, e)
                failed.append(JiraIssueResult(story_id=story_id, error=str(e)))

    return JiraCreationResponse(created_issues=created, failed_issues=failed)
