import json
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from conftest import login
from nexo import chat_routes
from nexo.models import Conversation, Draft, Message, now
from nexo.models import Ticket, User
from nexo.ticket_service import TicketService
from nexo.schemas import Proposal


def proposal(**overrides):
    return Proposal(
        intent="create",
        reply="Proposta",
        confidence=0.9,
        rationale="Evidência de teste",
        mode="stub",
        facts={
            "title": "VPN erro 809",
            "description": "Windows 11 sem VPN",
            "kind": "INC",
            "category": "Rede e VPN",
            "os": "Windows 11",
            "affected_scope": "individual",
            "blocked": True,
        },
        **overrides,
    )


def events(response):
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]


def test_chat_requires_confirmation_then_hands_off_without_duplicate(client, database, monkeypatch):
    async def fake(_):
        return proposal()

    monkeypatch.setattr(chat_routes, "request_proposal", fake)
    login(client)
    conv = client.post("/conversations").json()["id"]
    response = client.post(
        f"/conversations/{conv}/messages", json={"content": "VPN sem funcionar", "client_id": "once"}
    )
    assert response.status_code == 200
    assert any(e["type"] == "done" for e in events(response))
    persisted = database.scalar(select(Draft).where(Draft.conversation_id == conv))
    assert persisted is not None
    assert persisted.payload["due_at"]
    assert persisted.status == "PENDING"
    assert database.scalar(select(Ticket)) is None
    assert database.get(Conversation, conv).state == "AGENT_ACTIVE"
    assert client.post(
        f"/conversations/{conv}/messages", json={"content": "VPN sem funcionar", "client_id": "once"}
    ).json()["replayed"]
    saved = database.get(Conversation, conv)
    assert saved.turns == 1
    confirmed = client.post(f"/drafts/{persisted.id}/confirm", json={"revision": persisted.revision})
    assert confirmed.status_code == 200
    assert saved.state == "WAITING_ANALYST"
    assert (
        client.post(f"/drafts/{persisted.id}/confirm", json={"revision": persisted.revision}).status_code
        == 200
    )
    assert client.post(
        f"/conversations/{conv}/messages", json={"content": "Aguardando", "client_id": "human"}
    ).json()["agent_paused"]
    assert len(list(database.scalars(select(Ticket)))) == 1
    # The turn limit still applies to a conversation where the agent is active.
    saved.state = "AGENT_ACTIVE"
    saved.turns = 30
    database.commit()
    assert (
        client.post(f"/conversations/{conv}/messages", json={"content": "Olá", "client_id": "31"}).status_code
        == 429
    )
    assert client.post(f"/conversations/{conv}/handoff").status_code == 200
    assert client.post(
        f"/conversations/{conv}/messages", json={"content": "Aguardando", "client_id": "human-again"}
    ).json()["agent_paused"]


def test_handoff_during_generation_discards_agent_reply(client, database, monkeypatch):
    login(client)
    conv_id = client.post("/conversations").json()["id"]

    async def transfer_during_generation(_):
        with Session(database.bind) as concurrent:
            conv = concurrent.get(Conversation, conv_id)
            conv.state = "WAITING_ANALYST"
            conv.epoch += 1
            concurrent.commit()
        return proposal()

    monkeypatch.setattr(chat_routes, "request_proposal", transfer_during_generation)
    response = client.post(f"/conversations/{conv_id}/messages", json={"content": "VPN", "client_id": "race"})
    assert any(e["type"] == "paused" for e in events(response))
    assert database.scalar(select(Draft).where(Draft.conversation_id == conv_id)) is None
    messages = list(
        database.scalars(select(Message).where(Message.conversation_id == conv_id, Message.role == "AGENT"))
    )
    assert len(messages) == 1  # Only initial greeting, no late generated reply.


def test_expired_generation_can_be_retried_without_unlocking_human_state(client, database, monkeypatch):
    login(client)
    conv_id = client.post("/conversations").json()["id"]
    conv = database.get(Conversation, conv_id)
    conv.busy_until = now() - timedelta(minutes=1)
    database.commit()

    async def fake(_):
        return proposal()

    monkeypatch.setattr(chat_routes, "request_proposal", fake)
    assert client.get(f"/conversations/{conv_id}").json()["interrupted"]
    response = client.post(
        f"/conversations/{conv_id}/messages", json={"content": "Retomar VPN", "client_id": "retry"}
    )
    assert any(e["type"] == "done" for e in events(response))


def test_transient_legacy_failure_retries_without_repeating_model(client, database, monkeypatch):
    from nexo.config import settings
    from nexo import ticket_service

    calls = []

    async def fake(_):
        calls.append(True)
        return proposal()

    monkeypatch.setattr(chat_routes, "request_proposal", fake)
    monkeypatch.setattr(settings, "ticket_failure_mode", "transient")
    monkeypatch.setattr(ticket_service, "_transient_faults", 2)
    login(client)
    conv = client.post("/conversations").json()["id"]
    response = client.post(
        f"/conversations/{conv}/messages", json={"content": "VPN", "client_id": "transient"}
    )
    decision = next(e["data"] for e in events(response) if e["type"] == "decision")
    assert decision["legacy_attempts"] == 3
    assert len(calls) == 1


def test_add_information_collects_content_before_preparing_update(database):
    user = database.get(User, "alice")
    ticket = Ticket(
        code="INC-INFO",
        user_id=user.id,
        title="Notebook lento",
        description="Relato inicial",
        kind="INC",
        category="Hardware",
        priority="MEDIUM",
        due_at=now() + timedelta(days=3),
    )
    database.add(ticket)
    database.flush()
    conv = Conversation(user_id=user.id, selected_ticket_id=ticket.id)
    database.add(conv)
    database.flush()
    service = TicketService(database, user)
    request = Proposal(
        intent="update", reply="", confidence=0.9, rationale="Complemento solicitado", mode="stub"
    )
    reply, data = chat_routes.apply_proposal(
        database, user, conv, request, service, [ticket], "Adicionar informação"
    )
    assert "Qual informação" in reply
    assert "draft" not in data
    database.commit()
    request = Proposal(intent="create", reply="", confidence=0.9, rationale="Novos sintomas", mode="stub")
    _, data = chat_routes.apply_proposal(
        database, user, conv, request, service, [ticket], "A lentidão começou depois da atualização."
    )
    assert data["draft"]["operation"] == "UPDATE"
    assert data["draft"]["target_id"] == ticket.id
    assert data["draft"]["payload"]["description"] == "A lentidão começou depois da atualização."
    assert ticket.description == "Relato inicial"
    assert conv.state == "AGENT_ACTIVE"
