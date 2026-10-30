from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from conftest import login
from nexo import chat_routes
from nexo.models import Conversation, Draft, Ticket, User, now
from nexo.ticket_service import TicketService
from test_chat import events, proposal


@pytest.mark.parametrize("resolved", [False, True])
def test_automatic_registration_reuses_ticket_and_hands_off(database, resolved):
    user = database.get(User, "alice")
    ticket = Ticket(
        code="INC-AUTO",
        user_id=user.id,
        title="VPN erro 809",
        description="Problema inicial",
        kind="INC",
        category="Rede e VPN",
        priority="HIGH",
        status="RESOLVED" if resolved else "OPEN",
        resolved_at=now() - timedelta(days=1) if resolved else None,
        due_at=now() + timedelta(days=1),
    )
    conv = Conversation(user_id=user.id)
    database.add_all([ticket, conv])
    database.flush()
    reply, data = chat_routes.apply_proposal(
        database, user, conv, proposal(), TicketService(database, user), [ticket], "VPN não funciona"
    )
    database.commit()
    assert data["operation"] == ("REOPEN" if resolved else "UPDATE")
    assert data["tickets"][0]["code"] == ticket.code
    assert ticket.code in reply
    assert ticket.status == "WAITING_ANALYST"
    assert ticket.resolved_at is None
    assert conv.state == "WAITING_ANALYST"
    assert ticket.code in conv.summary
    assert len(list(database.scalars(select(Ticket)))) == 1
    assert database.scalar(select(Draft)).status == "COMMITTED"


def test_failed_transfer_rolls_back_automatic_registration(client, database, monkeypatch):
    async def fake(_):
        return proposal()

    def unavailable(*_):
        raise HTTPException(503, "Legado indisponível")

    monkeypatch.setattr(chat_routes, "request_proposal", fake)
    monkeypatch.setattr(TicketService, "transfer", unavailable)
    login(client)
    conv_id = client.post("/conversations").json()["id"]
    response = client.post(
        f"/conversations/{conv_id}/messages", json={"content": "VPN", "client_id": "failure"}
    )
    assert any(e["type"] == "error" for e in events(response))
    assert database.scalar(select(Ticket)) is None
    assert database.scalar(select(Draft)) is None
    conv = database.get(Conversation, conv_id)
    assert conv.state == "AGENT_ACTIVE"
    assert conv.busy_until is None
