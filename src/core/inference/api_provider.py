# Agentic TI OS – API inference provider
# OpenAI-style inference via API key (default path). Retries on transient failure.

import os
import time
from typing import Any

from openai import OpenAI

from .base import InferenceProvider


class APIProvider(InferenceProvider):
    """Inference via external API (e.g. OpenAI). Uses API key from env. Supports configurable retries."""

    def __init__(
        self,
        provider: str,
        model: str,
        api_key_env: str,
        timeout_seconds: int = 60,
        max_retries: int = 2,
        **kwargs: Any,
    ):
        self.provider = provider
        self.model = model
        self.api_key_env = api_key_env
        self.timeout_seconds = timeout_seconds
        self.max_retries = max(0, max_retries)
        api_key = os.environ.get(api_key_env)
        if not api_key:
            raise ValueError(f"Missing API key: set env {api_key_env}")
        self._client = OpenAI(api_key=api_key, timeout=timeout_seconds)

    def generate(self, prompt: str, **kwargs: Any) -> str:
        last_error = None
        for attempt in range(self.max_retries + 1):
            try:
                response = self._client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    timeout=self.timeout_seconds,
                    **kwargs,
                )
                choice = response.choices[0] if response.choices else None
                if not choice or not getattr(choice, "message", None):
                    return ""
                return choice.message.content or ""
            except Exception as e:
                last_error = e
                if attempt < self.max_retries:
                    time.sleep(1 * (attempt + 1))
                else:
                    raise RuntimeError(f"Inference failed after {self.max_retries + 1} attempts: {last_error}") from last_error
        return ""
