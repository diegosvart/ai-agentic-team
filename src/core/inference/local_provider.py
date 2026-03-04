# Agentic TI OS – Local inference provider
# Ollama-style inference via local HTTP endpoint.

import urllib.request
import urllib.error
import json
from typing import Any

from .base import InferenceProvider


class LocalProvider(InferenceProvider):
    """Inference via local endpoint (e.g. Ollama)."""

    def __init__(
        self,
        endpoint: str,
        model: str,
        timeout_seconds: int = 60,
        **kwargs: Any,
    ):
        self.endpoint = endpoint.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds

    def generate(self, prompt: str, **kwargs: Any) -> str:
        url = f"{self.endpoint}/api/generate"
        body = json.dumps({"model": self.model, "prompt": prompt, "stream": False}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, OSError, json.JSONDecodeError) as e:
            raise RuntimeError(f"Local inference failed: {e}") from e
        return data.get("response", "")
