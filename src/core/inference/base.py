# Agentic TI OS – Inference base
# Abstract provider interface for LLM inference (API or local).

from abc import ABC, abstractmethod


class InferenceProvider(ABC):
    """Abstract base for inference providers (API or local)."""

    @abstractmethod
    def generate(self, prompt: str, **kwargs) -> str:
        """Generate text from prompt. Returns the model response as string."""
        pass
