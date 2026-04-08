import os
import sqlite3

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, StateGraph

from app.agents.nodes import (
    clarification_review,
    draft_stories,
    format_for_export,
    generate_clarifying_questions,
    index_supporting_docs,
    parse_document,
    refine_stories,
    route_after_story_review,
    story_review,
)
from app.agents.state import WorkflowState
from app.core.config import settings


def create_graph():
    """
    Build and compile the story-draft-ai LangGraph workflow.

    A persistent sqlite3.Connection is opened once and passed directly to
    SqliteSaver. This ensures the connection is never garbage-collected
    mid-request (which would cause "Cannot operate on a closed database").

    Interrupt points:
      interrupt_before=["clarification_review"] — pauses after question
        generation; resumed once human submits clarification answers.
      interrupt_before=["story_review"] — pauses after story drafting /
        refinement; resumed once human submits edited stories ± feedback.

    Refinement loop:
      story_review → route_after_story_review:
        if feedback → refine_stories → story_review  (repeats)
        if approved → format_for_export → END
    """
    os.makedirs(os.path.dirname(os.path.abspath(settings.db_path)), exist_ok=True)

    # Open a single persistent connection for the lifetime of the process.
    # check_same_thread=False is required because FastAPI runs node functions
    # in background threads that differ from the thread that opened the connection.
    _conn = sqlite3.connect(settings.db_path, check_same_thread=False)
    checkpointer = SqliteSaver(_conn)

    builder = StateGraph(WorkflowState)

    builder.add_node("parse_document", parse_document)
    builder.add_node("index_supporting_docs", index_supporting_docs)
    builder.add_node("generate_clarifying_questions", generate_clarifying_questions)
    builder.add_node("clarification_review", clarification_review)
    builder.add_node("draft_stories", draft_stories)
    builder.add_node("story_review", story_review)
    builder.add_node("refine_stories", refine_stories)
    builder.add_node("format_for_export", format_for_export)

    builder.set_entry_point("parse_document")
    builder.add_edge("parse_document", "index_supporting_docs")
    builder.add_edge("index_supporting_docs", "generate_clarifying_questions")
    builder.add_edge("generate_clarifying_questions", "clarification_review")
    builder.add_edge("clarification_review", "draft_stories")
    builder.add_edge("draft_stories", "story_review")
    builder.add_edge("refine_stories", "story_review")  # refinement loop back
    builder.add_edge("format_for_export", END)

    builder.add_conditional_edges(
        "story_review",
        route_after_story_review,
        {
            "refine_stories": "refine_stories",
            "format_for_export": "format_for_export",
        },
    )

    graph = builder.compile(
        checkpointer=checkpointer,
        interrupt_before=["clarification_review", "story_review"],
    )

    return graph, _conn


# Module-level singletons — created once at import time and kept alive
# for the entire process. _db_conn must remain in scope so the connection
# is never closed by the garbage collector.
graph, _db_conn = create_graph()
