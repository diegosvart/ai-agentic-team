# Agentic TI OS – Run state (persisted between runs)
# Structured run state for orchestration and Gate A

from typing import Any, TypedDict


class RunState(TypedDict, total=False):
    """Structured run state persisted in SQLite between runs."""
    run_id: str
    current_node: str
    payload: dict[str, Any]
    gate_a_approved: bool
    awaiting_gate_a_approval: bool
    messages: list[Any]
