import asyncio
import json

import httpx
import pytest

from conftest import login
from nexo import chat_routes
from nexo.config import settings
from nexo.models import Conversation
from test_chat import events, proposal


@pytest.mark.parametrize(
    "case,expected",
    [
        ("timeout", "MODEL_TIMEOUT"),
        ("rate", "MODEL_RATE_LIMIT"),
        ("invalid", "MODEL_INVALID_OUTPUT"),
        ("unknown", "MODEL_UNAVAILABLE"),
    ],
)
def test_model_failures_have_safe_correlated_diagnostics(monkeypatch, caplog, case, expected):
    real_client = httpx.AsyncClient
    monkeypatch.setattr(settings, "internal_agent_secret", "private-key-do-not-log-1234567890123456")

    def handler(request):
        assert request.headers["X-Request-ID"] == "audit-request"
        if case == "timeout":
            raise httpx.ReadTimeout("private-provider-error", request=request)
        if case == "rate":
            return httpx.Response(503, json={"code": "MODEL_RATE_LIMIT", "raw": "private-body"})
        if case == "unknown":
            return httpx.Response(503, json={"code": ["private-error"]})
        return httpx.Response(200, json={"private": "invalid-proposal"})

    monkeypatch.setattr(
        chat_routes.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    with pytest.raises(chat_routes.AgentFailure) as failure:
        asyncio.run(
            chat_routes.request_proposal({"request_id": "audit-request", "content": "private-user-text"})
        )
    assert failure.value.code == expected
    records = [json.loads(r.message) for r in caplog.records if r.name == "nexo.agent"]
    assert records[-1]["request_id"] == "audit-request"
    assert records[-1]["code"] == expected
    assert "private" not in caplog.text


def test_failed_model_preserves_history_and_allows_explicit_retry(client, database, monkeypatch):
    async def unavailable(_):
        raise chat_routes.AgentFailure("MODEL_TIMEOUT", "test-correlation-id")

    monkeypatch.setattr(chat_routes, "request_proposal", unavailable)
    login(client)
    conv_id = client.post("/conversations").json()["id"]
    response = client.post(
        f"/conversations/{conv_id}/messages", json={"content": "VPN não funciona", "client_id": "failure"}
    )
    failure = next(e["data"] for e in events(response) if e["type"] == "error")
    assert failure["data"]["code"] == "MODEL_TIMEOUT"
    assert failure["data"]["request_id"] == "test-correlation-id"
    assert "demorou" in failure["content"]
    assert database.get(Conversation, conv_id).busy_until is None

    async def recovered(_):
        return proposal()

    monkeypatch.setattr(chat_routes, "request_proposal", recovered)
    response = client.post(
        f"/conversations/{conv_id}/messages", json={"content": "Tente novamente", "client_id": "retry"}
    )
    assert any(e["type"] == "done" for e in events(response))
    assert database.get(Conversation, conv_id).state == "WAITING_ANALYST"
