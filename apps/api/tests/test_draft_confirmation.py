from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from conftest import login
from nexo import chat_routes
from nexo.models import Conversation, Draft, Ticket, User, now
from nexo.schemas import Proposal
from nexo.ticket_service import TicketService, ticket_json
from test_chat import proposal


@pytest.mark.parametrize("status", [None, "OPEN", "RESOLVED"])
def test_no_ticket_mutation_until_confirmation_then_handoff(client, database, status):
    user = database.get(User, "alice")
    conv = Conversation(user_id=user.id)
    own = []
    if status:
        ticket = Ticket(
            code="INC-REVIEW",
            user_id=user.id,
            title="VPN erro 809",
            description="Problema inicial",
            kind="INC",
            category="Rede e VPN",
            priority="HIGH",
            status=status,
            resolved_at=now() - timedelta(days=1) if status == "RESOLVED" else None,
            due_at=now() + timedelta(days=1),
        )
        database.add(ticket)
        own.append(ticket)
    database.add(conv)
    database.flush()
    if own:
        conv.selected_ticket_id = own[0].id
    before = ticket_json(own[0]) if own else None
    reply, data = chat_routes.apply_proposal(
        database,
        user,
        conv,
        proposal().model_copy(update={"intent": "update" if status else "create"}),
        TicketService(database, user),
        own,
        "VPN não funciona",
    )
    database.commit()
    assert "confirmação" in reply
    assert data["draft"]["status"] == "PENDING"
    assert data["draft"]["operation"] == (
        "REOPEN" if status == "RESOLVED" else "UPDATE" if status else "CREATE"
    )
    assert conv.state == "AGENT_ACTIVE"
    assert len(list(database.scalars(select(Ticket)))) == (1 if status else 0)
    if own:
        assert ticket_json(own[0]) == before
    login(client)
    path = f"/drafts/{data['draft']['id']}/confirm"
    result = client.post(path, json={"revision": 1})
    assert result.status_code == 200, result.text
    assert result.json()["ticket"]["status"] == "WAITING_ANALYST"
    assert conv.state == "WAITING_ANALYST"
    assert conv.selected_ticket_id == result.json()["ticket"]["id"]
    replay = client.post(path, json={"revision": 1})
    assert replay.json()["ticket"]["id"] == result.json()["ticket"]["id"]
    assert len(list(database.scalars(select(Ticket)))) == 1


def test_failed_transfer_rolls_back_confirmation_and_preserves_draft(client, database, monkeypatch):
    user = database.get(User, "alice")
    conv = Conversation(user_id=user.id)
    database.add(conv)
    database.flush()
    _, data = chat_routes.apply_proposal(
        database, user, conv, proposal(), TicketService(database, user), [], "VPN não funciona"
    )
    database.commit()

    def unavailable(*_):
        raise HTTPException(503, "Legado indisponível")

    monkeypatch.setattr(TicketService, "transfer", unavailable)
    login(client)
    result = client.post(f"/drafts/{data['draft']['id']}/confirm", json={"revision": 1})
    assert result.status_code == 503
    assert database.scalar(select(Ticket)) is None
    draft = database.get(Draft, data["draft"]["id"])
    assert draft.status == "PENDING"
    assert draft.result_ticket_id is None
    assert conv.state == "AGENT_ACTIVE"


@pytest.mark.parametrize("existing", [False, True])
def test_critical_handoff_is_immediate_but_protocol_requires_confirmation(client, database, existing):
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
    before = ticket_json(own[0]) if own else None
    if existing:
        conv.selected_ticket_id = own[0].id
    _, data = chat_routes.apply_proposal(
        database,
        user,
        conv,
        Proposal(
            intent="update" if existing else "create",
            reply="",
            rationale="Equipe impedida",
            confidence=0.95,
            facts={
                "title": "Equipe sem rede",
                "category": "Rede e VPN",
                "affected_scope": "team",
                "blocked": True,
                "description": "Sem acesso, sem alternativa",
                "kind": "INC",
            },
        ),
        TicketService(database, user),
        own,
        "Toda a equipe sem rede",
    )
    database.commit()
    assert conv.state == "WAITING_ANALYST"
    assert conv.handoff_reason == "CRITICAL"
    assert data["draft"]["payload"]["priority"] == "CRITICAL"
    assert data["draft"]["status"] == "PENDING"
    assert len(list(database.scalars(select(Ticket)))) == (1 if existing else 0)
    if own:
        assert ticket_json(own[0]) == before
    login(client)
    response = client.post(f"/drafts/{data['draft']['id']}/confirm", json={"revision": 1})
    assert response.status_code == 200, response.text
    assert response.json()["ticket"]["priority"] == "CRITICAL"
    assert response.json()["ticket"]["status"] == "WAITING_ANALYST"
    assert conv.summary.startswith(response.json()["ticket"]["code"])


def test_analyst_claim_blocks_critical_confirmation_until_release(client, database):
    user = database.get(User, "alice")
    conv = Conversation(user_id=user.id)
    database.add(conv)
    database.flush()
    request = proposal().model_copy(update={"facts": {**proposal().facts, "affected_scope": "team"}})
    _, data = chat_routes.apply_proposal(
        database, user, conv, request, TicketService(database, user), [], "Equipe parada"
    )
    database.commit()
    login(client, "support")
    claimed = client.post(f"/analyst/conversations/{conv.id}/claim", json={"epoch": conv.epoch}).json()
    login(client)
    path = f"/drafts/{data['draft']['id']}/confirm"
    assert client.post(path, json={"revision": 1}).status_code == 409
    assert database.scalar(select(Ticket)) is None
    login(client, "support")
    assert (
        client.post(f"/analyst/conversations/{conv.id}/release", json={"epoch": claimed["epoch"]}).status_code
        == 200
    )
    login(client)
    assert client.post(path, json={"revision": 1}).status_code == 200


def test_noncritical_draft_cannot_be_confirmed_after_manual_handoff(client, database):
    user = database.get(User, "alice")
    conv = Conversation(user_id=user.id)
    database.add(conv)
    database.flush()
    _, data = chat_routes.apply_proposal(
        database, user, conv, proposal(), TicketService(database, user), [], "VPN não funciona"
    )
    database.commit()
    login(client)
    client.post(f"/conversations/{conv.id}/handoff")
    assert client.post(f"/drafts/{data['draft']['id']}/confirm", json={"revision": 1}).status_code == 409
    assert database.scalar(select(Ticket)) is None


def test_resolution_withdraws_pending_draft_without_creating_ticket(database):
    user = database.get(User, "alice")
    conv = Conversation(user_id=user.id)
    database.add(conv)
    database.flush()
    service = TicketService(database, user)
    _, data = chat_routes.apply_proposal(database, user, conv, proposal(), service, [], "VPN não funciona")
    draft = database.get(Draft, data["draft"]["id"])
    assert draft.status == "PENDING"
    chat_routes.apply_proposal(
        database,
        user,
        conv,
        Proposal(intent="resolved", reply="", rationale="Funcionou", confidence=0.9),
        service,
        [],
        "Funcionou, está resolvido",
    )
    assert draft.status == "INVALIDATED"
    assert database.scalar(select(Ticket)) is None


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
