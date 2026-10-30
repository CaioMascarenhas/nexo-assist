from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from conftest import login
from nexo import chat_routes
from nexo.models import Conversation, Draft, Ticket, User, now
from nexo.schemas import Proposal
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


@pytest.mark.parametrize("existing", [False, True])
def test_complete_critical_incident_is_registered_before_handoff(database, existing):
    user = database.get(User, "alice")
    conv = Conversation(user_id=user.id)
    database.add(conv)
    own = []
    if existing:
        ticket = Ticket(
            code="INC-NETWORK",
            user_id=user.id,
            title="Equipe sem rede",
            description="Falha inicial",
            kind="INC",
            category="Rede e VPN",
            priority="HIGH",
            due_at=now() + timedelta(days=1),
        )
        database.add(ticket)
        own.append(ticket)
    database.flush()
    reply, data = chat_routes.apply_proposal(
        database,
        user,
        conv,
        Proposal(
            intent="create",
            reply="",
            rationale="Equipe impedida de trabalhar",
            confidence=0.95,
            facts={
                "title": "Equipe sem rede",
                "category": "Rede e VPN",
                "affected_scope": "team",
                "blocked": True,
                "description": "Todos sem acesso, sem alternativa",
                "kind": "INC",
            },
        ),
        TicketService(database, user),
        own,
        "Toda a equipe está sem rede e impedida de trabalhar",
    )
    database.commit()
    assert conv.state == "WAITING_ANALYST"
    assert conv.handoff_reason == "CRITICAL"
    assert data["tickets"][0]["priority"] == "CRITICAL"
    assert data["tickets"][0]["status"] == "WAITING_ANALYST"
    assert data["tickets"][0]["code"] in reply
    assert data["operation"] == ("UPDATE" if existing else "CREATE")
    assert len(list(database.scalars(select(Ticket)))) == 1


def test_self_service_resolution_clears_triage_without_resolving_existing_ticket(database):
    user = database.get(User, "alice")
    ticket = Ticket(
        code="INC-KEEP",
        user_id=user.id,
        title="VPN",
        description="Falha",
        kind="INC",
        category="Rede e VPN",
        priority="HIGH",
        due_at=now() + timedelta(days=1),
    )
    database.add(ticket)
    database.flush()
    conv = Conversation(
        user_id=user.id,
        selected_ticket_id=ticket.id,
        facts={"category": "Rede e VPN", "os": "Windows 10", "_vpn_guidance_offered": True},
    )
    database.add(conv)
    database.flush()
    reply, data = chat_routes.apply_proposal(
        database,
        user,
        conv,
        Proposal(intent="resolved", reply="", rationale="Usuário confirmou sucesso", confidence=0.95),
        TicketService(database, user),
        [ticket],
        "A VPN voltou a funcionar. Não preciso de chamado.",
    )
    assert "Que bom" in reply
    assert "reinstale" not in reply
    assert conv.state == "AGENT_ACTIVE"
    assert conv.facts == {}
    assert ticket.status == "OPEN"
    assert ticket.resolved_at is None
    assert "draft" not in data and "tickets" not in data
    assert database.scalar(select(Draft)) is None


def test_consultation_does_not_reopen_resolved_ticket_from_old_critical_facts(database):
    user = database.get(User, "alice")
    ticket = Ticket(
        code="INC-CRITICAL-DONE",
        user_id=user.id,
        title="Equipe sem rede",
        description="Restabelecida",
        kind="INC",
        category="Rede e VPN",
        priority="CRITICAL",
        status="RESOLVED",
        due_at=now(),
        resolved_at=now(),
    )
    database.add(ticket)
    database.flush()
    conv = Conversation(
        user_id=user.id,
        selected_ticket_id=ticket.id,
        facts={"title": ticket.title, "category": ticket.category, "affected_scope": "team", "blocked": True},
    )
    database.add(conv)
    database.flush()
    _, data = chat_routes.apply_proposal(
        database,
        user,
        conv,
        Proposal(intent="consult", reply="", rationale="Consulta de status", confidence=0.95),
        TicketService(database, user),
        [ticket],
        "Qual o status?",
    )
    assert data["tickets"][0]["status"] == "RESOLVED"
    assert conv.state == "AGENT_ACTIVE"
    assert database.scalar(select(Draft)) is None
