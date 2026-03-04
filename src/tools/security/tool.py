# Agentic TI OS – Security tool
# SAST/deps/secrets scans + reporting (Phase 2)

import os
import re
import subprocess
from pathlib import Path
from typing import Any


def security_tool(action: str, **kwargs: Any) -> dict[str, Any]:
    """
    Execute security operation.
    action: "check_deps" – pip audit (vulnerable deps); "check_secrets" – simple pattern scan in repo.
    kwargs: path (optional) – project root; default cwd.
    """
    if action == "check_deps":
        return _check_deps(**kwargs)
    if action == "check_secrets":
        return _check_secrets(**kwargs)
    return {"ok": False, "findings": [], "summary": f"Unknown action: {action}"}


def _check_deps(path: str | Path | None = None, **kwargs: Any) -> dict[str, Any]:
    """Run pip audit; return { ok, findings, summary }."""
    cwd = Path(path) if path else Path.cwd()
    if not cwd.is_dir():
        return {"ok": False, "findings": [], "summary": f"Path not found: {cwd}"}
    try:
        result = subprocess.run(
            [os.environ.get("SECURITY_PIP_CMD", "pip"), "audit"],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=int(os.environ.get("SECURITY_AUDIT_TIMEOUT", "60")),
        )
        out = (result.stdout or "") + (result.stderr or "")
        findings = []
        for line in out.splitlines():
            if line.strip():
                findings.append(line.strip())
        ok = result.returncode == 0
        summary = "No known vulnerabilities" if ok and not findings else ("Vulnerabilities reported" if findings else out or f"Exit {result.returncode}")
        return {"ok": ok, "findings": findings, "summary": summary}
    except subprocess.TimeoutExpired:
        return {"ok": False, "findings": [], "summary": "pip audit timeout"}
    except FileNotFoundError:
        return {"ok": False, "findings": [], "summary": "pip not found or pip audit unavailable (pip >= 21.3)"}
    except Exception as e:
        return {"ok": False, "findings": [], "summary": str(e)}


# Simple secret patterns (high false-positive; for Phase 2 minimal)
_SECRET_PATTERNS = [
    (re.compile(r'(?i)(api[_-]?key|apikey)\s*[:=]\s*["\']?[a-zA-Z0-9_\-]{20,}["\']?'), "API key pattern"),
    (re.compile(r'(?i)(password|passwd|pwd)\s*[:=]\s*["\'][^"\']+["\']'), "Password in plaintext"),
    (re.compile(r'sk-[a-zA-Z0-9]{20,}'), "OpenAI-style secret key"),
]


def _check_secrets(path: str | Path | None = None, **kwargs: Any) -> dict[str, Any]:
    """Scan text files for simple secret patterns; return { ok, findings, summary }."""
    root = Path(path) if path else Path.cwd()
    if not root.is_dir():
        return {"ok": False, "findings": [], "summary": f"Path not found: {root}"}
    findings = []
    skip_dirs = {".git", "__pycache__", "node_modules", ".venv", "venv"}
    skip_suffixes = {".pyc", ".png", ".jpg", ".jar", ".whl"}
    try:
        for f in root.rglob("*"):
            if not f.is_file() or any(p in f.parts for p in skip_dirs) or f.suffix.lower() in skip_suffixes:
                continue
            try:
                with open(f, "r", encoding="utf-8", errors="ignore") as fp:
                    text = fp.read()
            except OSError:
                continue
            for pattern, label in _SECRET_PATTERNS:
                for m in pattern.finditer(text):
                    findings.append({"file": str(f.relative_to(root)), "label": label, "snippet": m.group(0)[:50] + "..."})
    except Exception as e:
        return {"ok": False, "findings": [], "summary": str(e)}
    ok = len(findings) == 0
    summary = f"{len(findings)} potential secret(s) found" if findings else "No obvious secrets in scanned files"
    return {"ok": ok, "findings": findings[:50], "summary": summary}
