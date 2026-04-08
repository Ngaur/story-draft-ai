import uuid
from typing import Literal, Optional
from pydantic import BaseModel, Field


# ── Concept extraction ────────────────────────────────────────────────────────

class ConceptNode(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = Field(description="Short title of the concept (3–8 words)")
    description: str = Field(description="1–3 sentence description of what this concept represents")


class ConceptNodeListOutput(BaseModel):
    """Wrapper — LLMs cannot return bare list[ConceptNode]."""
    concepts: list[ConceptNode]


# ── Clarifying questions ──────────────────────────────────────────────────────

class ClarifyingQuestion(BaseModel):
    concept_id: str = Field(description="ID of the ConceptNode this question targets")
    question_text: str = Field(description="The full text of the clarifying question")
    question_type: Literal["open", "yes_no", "multiple_choice", "multiple_select"] = Field(
        description=(
            "Type of answer expected from the human reviewer. "
            "'open' = free-text. 'yes_no' = binary Yes/No. "
            "'multiple_choice' = pick exactly one option from a list. "
            "'multiple_select' = pick all options that apply (checkboxes)."
        )
    )
    options: Optional[list[str]] = Field(
        default=None,
        description=(
            "Answer options — populated when question_type is 'multiple_choice' or "
            "'multiple_select'. Provide exactly 3–5 options."
        ),
    )


class ClarifyingQuestionsOutput(BaseModel):
    """Wrapper — LLMs cannot return bare list[ClarifyingQuestion]."""
    questions: list[ClarifyingQuestion]


# ── User stories ──────────────────────────────────────────────────────────────

class UserStory(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    concept_id: str = Field(description="ID of the ConceptNode this story was derived from")

    # ── Section 1: Epic & Title ───────────────────────────────────────────────
    epic_title: str = Field(
        description="Name of the epic this story belongs to (outcome-focused, 3–7 words)"
    )
    title: str = Field(
        description="Short, outcome-focused user story title in imperative mood (5–10 words)"
    )

    # ── Section 2: User Story Statement ──────────────────────────────────────
    role: str = Field(description="The user role — e.g. 'product manager', 'admin'")
    want: str = Field(description="What the user wants to do — the capability being requested")
    benefit: str = Field(description="The measurable business value or outcome this story delivers")

    # ── Section 3: Detailed Description ──────────────────────────────────────
    detailed_description: str = Field(
        description="Full context, scope, and constraints of this story. Explain the business "
                    "problem, who is affected, what the expected behaviour is, and any known "
                    "constraints or boundaries."
    )

    # ── Section 4: Pre-Conditions ─────────────────────────────────────────────
    pre_conditions: list[str] = Field(
        description="Conditions that MUST be true before this story can begin. "
                    "E.g. user is authenticated, system is in a specific state, "
                    "upstream data is available."
    )

    # ── Section 5: Post-Conditions ────────────────────────────────────────────
    post_conditions: list[str] = Field(
        description="Conditions that MUST be true after this story is complete. "
                    "E.g. data is persisted, downstream systems are notified, "
                    "audit log is written."
    )

    # ── Section 6: Data Governance ────────────────────────────────────────────
    data_governance: list[str] = Field(
        description="Data-related considerations: data handling in transit and at rest, "
                    "encryption requirements, PCI DSS implications, masking/tokenization rules, "
                    "logging constraints, retention and archival requirements. "
                    "Use an empty list if none apply."
    )

    # ── Section 7: Acceptance Criteria ───────────────────────────────────────
    acceptance_criteria: list[str] = Field(
        description="Given-When-Then format acceptance criteria covering both functional and "
                    "non-functional requirements. Minimum 4 criteria; include at least one "
                    "non-functional criterion (performance, security, accessibility, etc.)."
    )

    # ── Section 8: Assumptions ────────────────────────────────────────────────
    assumptions: list[str] = Field(
        description="Assumptions made during story creation that have NOT been formally "
                    "confirmed. Each item should be a clear, testable statement."
    )

    # ── Section 9: Assertions (Limitations / Out of Scope) ───────────────────
    assertions: list[str] = Field(
        description="Explicitly state what is OUT OF SCOPE or intentionally excluded: "
                    "functional limitations, technical limitations, operational constraints, "
                    "areas deliberately not built in this story."
    )

    # ── Section 10: Edge Cases & Error Scenarios ──────────────────────────────
    edge_cases: list[str] = Field(
        description="Unusual flows, boundary conditions, and potential failure scenarios "
                    "that must be handled or explicitly dismissed. Include error messages "
                    "or fallback behaviours where relevant."
    )

    # ── Section 11: Dependencies ──────────────────────────────────────────────
    dependencies: list[str] = Field(
        description="System, team, API, or data dependencies this story relies on. "
                    "Include blocking dependencies that must be resolved before work starts."
    )

    # ── Section 12: Example Data & Scenarios ─────────────────────────────────
    example_data: list[str] = Field(
        description="Realistic, concrete examples for developers and QA. Include sample "
                    "inputs, expected outputs, and representative use cases."
    )

    # ── Section 13: Test Scenarios ────────────────────────────────────────────
    test_scenarios: list[str] = Field(
        description="Summary of key test cases: functional happy path, negative paths, "
                    "boundary tests, performance tests, and security tests relevant to "
                    "this story."
    )

    # ── Section 14: Definition of Done ───────────────────────────────────────
    definition_of_done: list[str] = Field(
        description="Specific, measurable conditions for story completion. Must cover: "
                    "code complete and reviewed, unit/integration tests passing, "
                    "documentation updated, product owner sign-off, deployed to target "
                    "environment, and any compliance/audit requirements met."
    )

    # ── Refinement change summary ─────────────────────────────────────────────
    change_summary: Optional[str] = Field(
        default=None,
        description=(
            "1–3 sentence plain-English summary of what changed in this refinement pass. "
            "Populated ONLY during refinement — leave null for initial drafts."
        ),
    )

    # ── Metadata ──────────────────────────────────────────────────────────────
    story_points_estimate: int = Field(
        ge=1,
        le=13,
        description="Fibonacci-scale story point estimate: 1, 2, 3, 5, 8, or 13",
    )
    priority: Literal["High", "Medium", "Low"] = Field(
        description="Business priority of this story"
    )


class UserStoryListOutput(BaseModel):
    """Wrapper — LLMs cannot return bare list[UserStory]."""
    stories: list[UserStory]


class DocumentSummaryOutput(BaseModel):
    """Structured output for a single supporting-document summarisation call."""
    summary: str = Field(
        description=(
            "Concise 200-400 word summary of the document. Focus exclusively on: "
            "core purpose and scope, key domain entities and their relationships, "
            "business rules and constraints, technical requirements and limitations, "
            "important terminology and definitions. Omit boilerplate, formatting "
            "instructions, and content that has no bearing on feature development."
        )
    )
