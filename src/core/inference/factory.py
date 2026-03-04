# Agentic TI OS – Inference factory
# Builds provider from config; supports optional fallback (structure only).

from typing import Any

from .base import InferenceProvider
from .api_provider import APIProvider
from .local_provider import LocalProvider


def get_provider(config: dict[str, Any]) -> InferenceProvider:
    """
    Return the configured inference provider.
    config must contain ["inference"]["mode"] ("api" | "local") and
    corresponding ["inference"]["api"] or ["inference"]["local"].
    """
    inference = config.get("inference") or {}
    mode = inference.get("mode", "api")
    timeout = inference.get("timeout_seconds", 60)
    fallback_enabled = inference.get("fallback_enabled", False)

    max_retries = inference.get("max_retries", 2)
    try:
        if mode == "api":
            api_cfg = inference.get("api") or {}
            return APIProvider(
                provider=api_cfg.get("provider", "openai"),
                model=api_cfg.get("model", "gpt-4o-mini"),
                api_key_env=api_cfg.get("api_key_env", "OPENAI_API_KEY"),
                timeout_seconds=timeout,
                max_retries=max_retries,
            )
        if mode == "local":
            local_cfg = inference.get("local") or {}
            return LocalProvider(
                endpoint=local_cfg.get("endpoint", "http://localhost:11434"),
                model=local_cfg.get("model", "mistral"),
                timeout_seconds=timeout,
            )
    except Exception:
        if fallback_enabled:
            if mode == "api":
                local_cfg = inference.get("local") or {}
                return LocalProvider(
                    endpoint=local_cfg.get("endpoint", "http://localhost:11434"),
                    model=local_cfg.get("model", "mistral"),
                    timeout_seconds=timeout,
                )
            api_cfg = inference.get("api") or {}
            return APIProvider(
                provider=api_cfg.get("provider", "openai"),
                model=api_cfg.get("model", "gpt-4o-mini"),
                api_key_env=api_cfg.get("api_key_env", "OPENAI_API_KEY"),
                timeout_seconds=timeout,
                max_retries=max_retries,
            )
        raise

    raise ValueError(f"Unknown inference mode: {mode!r}")
