# Agentic TI OS – Gates
# Conditional edges and approval gates

def should_continue(state: dict) -> str:
    """Determine next node or end from state. Used for Gate A: stop until approval."""
    if state.get("gate_a_approved"):
        return "continue"
    return "end"


def gate_a_node(state: dict) -> dict:
    """Gate A: pass-through node; routing is done by conditional edge (should_continue)."""
    out = {**state, "current_node": "gate_a"}
    if not state.get("gate_a_approved"):
        out["awaiting_gate_a_approval"] = True
    return out
