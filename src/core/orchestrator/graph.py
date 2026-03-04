# Agentic TI OS – Orchestrator graph
# LangGraph workflow: PM -> Gate A -> TL -> Security -> QA

from langgraph.graph import StateGraph, START, END

from .state import OrchestratorState
from .gates import gate_a_node, should_continue
from .nodes.pm import pm_node
from .nodes.techlead import techlead_node
from .nodes.security import security_node
from .nodes.qa import qa_node


def build_graph():
    """Build and return the orchestrator graph. Gate A stops execution until gate_a_approved."""
    builder = StateGraph(OrchestratorState)
    builder.add_node("pm", pm_node)
    builder.add_node("gate_a", gate_a_node)
    builder.add_node("techlead", techlead_node)
    builder.add_node("security", security_node)
    builder.add_node("qa", qa_node)

    builder.add_edge(START, "pm")
    builder.add_edge("pm", "gate_a")
    builder.add_conditional_edges("gate_a", should_continue, {"continue": "techlead", "end": END})
    builder.add_edge("techlead", "security")
    builder.add_edge("security", "qa")
    builder.add_edge("qa", END)

    return builder.compile()
