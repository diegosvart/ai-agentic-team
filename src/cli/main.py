# Agentic TI OS – CLI entrypoint
# Runs orchestrator workflow inside Docker; Gate A stops until approval.

from src.core.orchestrator.graph import build_graph
from src.observability.logging import get_logger
from src.observability.evidence import build_run_summary, record_evidence

logger = get_logger(__name__)


def main() -> None:
    """CLI main entrypoint: build graph and run workflow (PM -> Gate A -> Security -> QA)."""
    import os
    gate_approved = os.environ.get("AGENTIC_GATE_A_APPROVED", "").strip().lower() in ("1", "true", "yes")
    graph = build_graph()
    initial = {"messages": [], "gate_a_approved": gate_approved}
    logger.info("workflow_start")
    result = graph.invoke(initial)
    logger.info("workflow_end", extra={"current_node": result.get("current_node")})
    summary = build_run_summary(result)
    record_evidence("run_summary", summary)
    if result.get("awaiting_gate_a_approval"):
        print("Workflow ended at Gate A (awaiting approval). Set gate_a_approved=True and re-run to continue.")
    else:
        print("Workflow completed.")


if __name__ == "__main__":
    main()
