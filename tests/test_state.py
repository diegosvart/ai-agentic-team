# Agentic TI OS – State tests

import pytest
from src.core.orchestrator.state import OrchestratorState


def test_orchestrator_state_typing():
    state: OrchestratorState = {}
    state["current_node"] = "pm"
    assert state.get("current_node") == "pm"
