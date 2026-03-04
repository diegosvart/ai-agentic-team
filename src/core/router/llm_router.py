# Agentic TI OS – LLM router
# Route requests to API (default) or local (Ollama) via inference layer.

from pathlib import Path
from typing import Optional

from src.core.inference import get_provider, load_inference_config


def route_llm(
    prompt: str,
    provider: Optional[str] = None,
    config_path: Optional[str | Path] = None,
) -> str:
    """Route to configured LLM and return response. Default mode is API (API key)."""
    config = load_inference_config(config_path)
    inference = config.get("inference") or {}
    if provider is not None:
        inference = {**inference, "mode": provider}
        config = {**config, "inference": inference}
    prov = get_provider(config)
    return prov.generate(prompt)
