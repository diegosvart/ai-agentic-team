# Agentic TI OS – QA tool
# Test runner + reporting (Phase 2)

import subprocess
import os
from pathlib import Path
from typing import Any


def qa_tool(action: str, **kwargs: Any) -> dict[str, Any]:
    """
    Execute QA operation.
    action: "run_tests" – run pytest, return structured result.
    kwargs: path (optional) – project root for tests; default cwd.
    """
    if action == "run_tests":
        return _run_tests(**kwargs)
    return {"ok": False, "error": f"Unknown action: {action}"}


def _run_tests(path: str | Path | None = None, **kwargs: Any) -> dict[str, Any]:
    """Run pytest; return { ok, passed, failed, output }."""
    cwd = Path(path) if path else Path.cwd()
    if not cwd.is_dir():
        return {"ok": False, "passed": 0, "failed": 0, "output": f"Path not found: {cwd}"}
    cmd = [
        os.environ.get("QA_TEST_CMD", "python"),
        "-m",
        "pytest",
        "tests/",
        "-v",
        "--tb=short",
        "-q",
    ]
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=int(os.environ.get("QA_TEST_TIMEOUT", "120")),
        )
        out = (result.stdout or "") + (result.stderr or "")
        passed = failed = 0
        for line in out.splitlines():
            if " passed" in line:
                parts = line.split()
                for i, p in enumerate(parts):
                    if p == "passed" and i > 0:
                        try:
                            passed = int(parts[i - 1])
                        except ValueError:
                            pass
                        break
            if " failed" in line:
                parts = line.split()
                for i, p in enumerate(parts):
                    if p == "failed" and i > 0:
                        try:
                            failed = int(parts[i - 1])
                        except ValueError:
                            pass
                        break
        ok = result.returncode == 0 and failed == 0
        return {
            "ok": ok,
            "passed": passed,
            "failed": failed,
            "output": out.strip() or f"Exit code {result.returncode}",
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "passed": 0, "failed": 0, "output": "pytest timeout"}
    except FileNotFoundError:
        return {"ok": False, "passed": 0, "failed": 0, "output": "pytest not found"}
    except Exception as e:
        return {"ok": False, "passed": 0, "failed": 0, "output": str(e)}
