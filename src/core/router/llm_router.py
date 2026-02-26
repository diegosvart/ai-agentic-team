# Agentic TI OS – LLM router
# Route requests to local (Ollama) or remote LLM

def route_llm(prompt: str, provider: str | None = None) -> str:
    """Route to configured LLM and return response."""
    raise NotImplementedError("LLM router to be implemented")
