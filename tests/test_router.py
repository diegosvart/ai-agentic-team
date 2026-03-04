# Agentic TI OS – Router tests
# V1.4 (router delega y retorna str), V1.5 (get_default_provider == "api").

from unittest.mock import MagicMock, patch

import pytest

from src.core.router.llm_router import route_llm
from src.core.router.policies import get_default_provider


def test_default_provider():
    """V1.5: Políticas devuelven 'api' por defecto."""
    assert get_default_provider() == "api"


def test_route_llm_delegates_to_provider_and_returns_str():
    """V1.4: route_llm(prompt) usa get_provider().generate(prompt) y retorna str."""
    fake_response = "test response from provider"
    mock_provider = MagicMock()
    mock_provider.generate.return_value = fake_response

    with patch("src.core.router.llm_router.get_provider", return_value=mock_provider), patch(
        "src.core.router.llm_router.load_inference_config",
        return_value={"inference": {"mode": "api"}},
    ):
        result = route_llm("Hello")

    assert result == fake_response
    mock_provider.generate.assert_called_once_with("Hello")
    assert isinstance(result, str)
