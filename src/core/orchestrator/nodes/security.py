# Agentic TI OS – Security node
# Runs security tool (deps/secrets) and records result in state

import time
from src.tools.security.tool import security_tool
from src.observability.logging import get_logger
from src.observability.evidence import record_evidence

logger = get_logger(__name__)


def security_node(state: dict) -> dict:
    """Security node: run check_deps, log eval_result, record evidence, attach result to state."""
    path = state.get("payload", {}).get("project_path") or state.get("project_path")
    start = time.perf_counter()
    result = security_tool("check_deps", path=path)
    duration_ms = int((time.perf_counter() - start) * 1000)
    status = "ok" if result.get("ok") else "fail"
    summary = (result.get("summary") or "")[:500]
    logger.info(
        "eval_result",
        extra={
            "event": "eval_result",
            "tool": "security_tool",
            "duration_ms": duration_ms,
            "status": status,
            "summary": summary,
        },
    )
    record_evidence("security_check_deps", {"result": result, "duration_ms": duration_ms})
    return {**state, "current_node": "security", "security_result": result}
