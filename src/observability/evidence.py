# Agentic TI OS – Evidence capture
# Store and retrieve execution evidence for traceability (Phase 2).

import json
import os
from pathlib import Path
from typing import Any

EVIDENCE_DIR = Path(os.environ.get("LOG_DIR", "logs"))
EVIDENCE_FILE = EVIDENCE_DIR / "evidence.jsonl"


def record_evidence(step: str, payload: dict[str, Any]) -> None:
    """Record evidence for a step. Appends one JSON line to logs/evidence.jsonl (or LOG_DIR/evidence.jsonl)."""
    try:
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        line = json.dumps({"step": step, "payload": payload}) + "\n"
        with open(EVIDENCE_FILE, "a", encoding="utf-8") as f:
            f.write(line)
    except OSError:
        pass


def build_run_summary(state: dict[str, Any], evidence_refs: list[str] | None = None) -> dict[str, Any]:
    """
    Build minimal Run Summary from current state and optional evidence step refs.
    Structure aligned to master_plan state_model: run_id, status, steps, tool_results, timestamps.
    """
    run_id = state.get("run_id") or "run"
    status = "done" if not state.get("awaiting_gate_a_approval") else "blocked"
    steps = []
    if state.get("current_node"):
        steps.append(state["current_node"])
    tool_results = {}
    if state.get("qa_result"):
        tool_results["qa"] = {"ok": state["qa_result"].get("ok"), "passed": state["qa_result"].get("passed"), "failed": state["qa_result"].get("failed")}
    if state.get("security_result"):
        tool_results["security"] = {"ok": state["security_result"].get("ok"), "summary": state["security_result"].get("summary", "")[:200]}
    return {
        "run_id": run_id,
        "status": status,
        "steps": steps,
        "tool_results": tool_results,
        "evidence_refs": evidence_refs or [],
    }
