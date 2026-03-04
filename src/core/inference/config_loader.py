# Agentic TI OS – Inference config loader
# Loads [inference] from TOML (master_plan.toml or dedicated config).

import os
from pathlib import Path
from typing import Any

try:
    import tomllib
except ImportError:
    import tomli as tomllib  # type: ignore


def _default_inference_config() -> dict[str, Any]:
    """Default config: API mode, OpenAI."""
    return {
        "inference": {
            "mode": "api",
            "fallback_enabled": False,
            "timeout_seconds": 60,
            "api": {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "api_key_env": "OPENAI_API_KEY",
            },
            "local": {
                "provider": "ollama",
                "endpoint": "http://localhost:11434",
                "model": "mistral",
            },
        }
    }


def load_inference_config(config_path: str | Path | None = None) -> dict[str, Any]:
    """
    Load full config from TOML file. Expects [inference] section.
    If config_path is None, looks for master_plan.toml in cwd and parent.
    Returns dict with at least ["inference"]; uses defaults if file missing.
    """
    if config_path is not None:
        path = Path(config_path)
        if path.is_file():
            with open(path, "rb") as f:
                data = dict(tomllib.load(f))
            if "inference" not in data:
                data["inference"] = _default_inference_config()["inference"]
            return data
        return _default_inference_config()

    for candidate in [Path.cwd(), Path.cwd().parent]:
        p = candidate / "master_plan.toml"
        if p.is_file():
            with open(p, "rb") as f:
                data = dict(tomllib.load(f))
            if "inference" not in data:
                data["inference"] = _default_inference_config()["inference"]
            return data

    return _default_inference_config()
