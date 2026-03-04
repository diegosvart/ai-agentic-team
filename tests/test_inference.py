# Agentic TI OS – Inference layer tests (solo API; sin Ollama)
# Verificación V1.1, V1.2, V1.3 del plan de corroboración.

import os
from pathlib import Path
from unittest.mock import patch

import pytest

from src.core.inference import get_provider, load_inference_config
from src.core.inference.api_provider import APIProvider


def test_load_inference_config_default_returns_api_mode():
    """V1.1: load_inference_config() sin argumentos devuelve mode == 'api' y api_key_env correcto."""
    config = load_inference_config()
    inference = config.get("inference", {})
    assert inference.get("mode") == "api"
    api_cfg = inference.get("api", {})
    assert api_cfg.get("api_key_env") == "OPENAI_API_KEY"


def test_load_inference_config_from_file():
    """V1.2: load_inference_config(path) lee [inference] desde master_plan.toml."""
    root = Path(__file__).resolve().parent.parent
    config_path = root / "master_plan.toml"
    if not config_path.is_file():
        pytest.skip("master_plan.toml no encontrado en raíz del proyecto")
    config = load_inference_config(config_path)
    inference = config.get("inference", {})
    assert "mode" in inference
    assert "api" in inference
    assert inference.get("mode") == "api"


def test_get_provider_returns_api_provider_when_mode_api():
    """V1.3: get_provider(config) con mode 'api' devuelve instancia de APIProvider."""
    config = {
        "inference": {
            "mode": "api",
            "timeout_seconds": 60,
            "api": {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "api_key_env": "OPENAI_API_KEY",
            },
        }
    }
    with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key-for-unit-test"}):
        provider = get_provider(config)
    assert isinstance(provider, APIProvider)
