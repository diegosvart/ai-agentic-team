# Agentic TI OS – Orchestrator state
# Typed state for the graph

from typing import TypedDict, Any


class OrchestratorState(TypedDict, total=False):
    """State shared across orchestrator nodes."""
    messages: list[Any]
    current_node: str
    payload: dict[str, Any]
    gate_a_approved: bool
    awaiting_gate_a_approval: bool
