# Agentic TI OS – Inference package
# Dual inference: API (default) and local (Ollama).

from .base import InferenceProvider
from .api_provider import APIProvider
from .local_provider import LocalProvider
from .factory import get_provider
from .config_loader import load_inference_config

__all__ = [
    "InferenceProvider",
    "APIProvider",
    "LocalProvider",
    "get_provider",
    "load_inference_config",
]
