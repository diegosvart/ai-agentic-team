# Agentic TI OS – API inference provider
# OpenAI-style inference via API key (default path).

import os
from typing import Any

from openai import OpenAI

from .base import InferenceProvider


class APIProvider(InferenceProvider):
    """Inference via external API (e.g. OpenAI). Uses API key from env."""

    def __init__(
        self,
        provider: str,
        model: str,
        api_key_env: str,
        timeout_seconds: int = 60,
        **kwargs: Any,
    ):
        self.provider = provider
        self.model = model
        self.api_key_env = api_key_env
        self.timeout_seconds = timeout_seconds
        api_key = os.environ.get(api_key_env)
        if not api_key:
            raise ValueError(f"Missing API key: set env {api_key_env}")
        self._client = OpenAI(api_key=api_key, timeout=timeout_seconds)

    def generate(self, prompt: str, **kwargs: Any) -> str:
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
