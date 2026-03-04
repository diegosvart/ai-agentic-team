# Agentic TI OS – QA node
# Runs QA tool (tests) and records result in state for logging/evidence

import time
from src.tools.qa.tool import qa_tool
from src.observability.logging import get_logger
from src.observability.evidence import record_evidence

logger = get_logger(__name__)


def qa_node(state: dict) -> dict:
    """QA node: run tests, log eval_result, record evidence, attach result to state."""
    path = state.get("payload", {}).get("project_path") or state.get("project_path")
    start = time.perf_counter()
    result = qa_tool("run_tests", path=path)
    duration_ms = int((time.perf_counter() - start) * 1000)
    status = "ok" if result.get("ok") else "fail"
    summary = (result.get("output") or result.get("passed", 0).__str__())[:500]
    logger.info(
        "eval_result",
        extra={
            "event": "eval_result",
            "tool": "qa_tool",
            "duration_ms": duration_ms,
            "status": status,
            "summary": summary,
            "passed": result.get("passed", 0),
            "failed": result.get("failed", 0),
        },
    )
    record_evidence("qa_tests", {"result": result, "duration_ms": duration_ms})
    return {**state, "current_node": "qa", "qa_result": result}
