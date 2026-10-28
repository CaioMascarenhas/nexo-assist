from datetime import timedelta

from conftest import login
from nexo.chat_routes import apply_proposal
from nexo.domain import due_at
from nexo.models import Conversation, Ticket, User, now
from nexo.schemas import Proposal
from nexo.ticket_service import TicketService


def setup(database, overdue=False):
    user = database.get(User, "alice")
    instant = now()
    ticket = Ticket(
        code="INC-IMPACT",
        user_id=user.id,
        title="Notebook lento",
        description="Lentidão inicial",
        kind="INC",
        category="Hardware",
        priority="MEDIUM",
        support_updated_at=instant,
        due_at=instant + timedelta(days=-1 if overdue else 3),
    )
    database.add(ticket)
    database.flush()
    conv = Conversation(user_id=user.id, selected_ticket_id=ticket.id)
    database.add(conv)
    database.flush()
    return user, ticket, conv


def test_complement_escalates_only_after_confirmation_without_resetting_anchor(client, database):
    user, ticket, conv = setup(database)
    anchor = ticket.support_updated_at
    proposal = Proposal(
        intent="update",
        reply="",
        confidence=0.9,
        rationale="Agora impede o trabalho",
        facts={"blocked": True, "affected_scope": "individual"},
        mode="stub",
    )
    _, data = apply_proposal(
        database, user, conv, proposal, TicketService(database, user), [ticket], "Agora não consigo trabalhar"
    )
    database.commit()
    assert ticket.priority == "MEDIUM"
    assert data["draft"]["payload"]["priority"] == "HIGH"
    login(client)
    response = client.post(f"/drafts/{data['draft']['id']}/confirm", json={"revision": 1})
    assert response.status_code == 200
    assert response.json()["ticket"]["priority"] == "HIGH"
    assert response.json()["ticket"]["due_at"] == due_at(anchor, "HIGH").isoformat()
    assert ticket.support_updated_at == anchor


def test_overdue_complement_transfers_instead_of_preparing_draft(database):
    user, ticket, conv = setup(database, overdue=True)
    proposal = Proposal(intent="update", reply="", confidence=0.9, rationale="Complementar", mode="stub")
    _, data = apply_proposal(
        database, user, conv, proposal, TicketService(database, user), [ticket], "Adicionar informação"
    )
    assert conv.state == "WAITING_ANALYST"
    assert conv.handoff_reason == "OVERDUE"
    assert "draft" not in data


def test_confirmed_impact_is_persisted_and_existing_priority_does_not_drop(client, database):
    user, ticket, conv = setup(database)
    ticket.priority = "HIGH"
    service = TicketService(database, user)
    draft = service.prepare(
        conv,
        {
            "title": ticket.title,
            "description": "Afeta a equipe, com alternativa.",
            "kind": "INC",
            "category": "Hardware",
            "priority": "MEDIUM",
            "affected_scope": "team",
        },
        ticket,
    )
    database.commit()
    assert ticket.affected_scope == "individual"
    login(client)
    result = client.post(f"/drafts/{draft.id}/confirm", json={"revision": 1}).json()["ticket"]
    assert result["priority"] == "HIGH"
    assert result["affected_scope"] == "team"
