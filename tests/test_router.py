# Agentic TI OS – Router tests

import pytest
from src.core.router.policies import get_default_provider


def test_default_provider():
    assert get_default_provider() == "ollama"
