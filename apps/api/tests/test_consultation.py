from datetime import timedelta

from nexo.chat_routes import apply_proposal
from nexo.models import Conversation, Ticket, User, now
from nexo.schemas import Proposal
from nexo.ticket_service import TicketService


def context(database):
    user = database.get(User, "alice")
    tickets = [
        Ticket(
            code="INC-ONE",
            user_id="alice",
            title="Notebook",
            description="Falha",
            kind="INC",
            category="Hardware",
            priority="LOW",
            due_at=now() + timedelta(days=5),
        ),
        Ticket(
            code="INC-DONE",
            user_id="alice",
            title="SAP",
            description="Resolvido",
            kind="INC",
            category="Acesso",
            priority="MEDIUM",
            status="RESOLVED",
            resolved_at=now() - timedelta(days=2),
            due_at=now() - timedelta(days=1),
        ),
        Ticket(
            code="INC-SECRET",
            user_id="bob",
            title="Privado",
            description="Não revelar",
            kind="INC",
            category="Software",
            priority="HIGH",
            due_at=now(),
        ),
    ]
    database.add_all(tickets)
    conv = Conversation(user_id=user.id)
    database.add(conv)
    database.flush()
    service = TicketService(database, user)
    proposal = Proposal(intent="consult", reply="", confidence=0.9, rationale="Consulta", mode="stub")
    return user, conv, service, proposal


def test_protocol_selection_reset_and_resolved_filter(database):
    user, conv, service, proposal = context(database)
    own = service.list()
    _, data = apply_proposal(database, user, conv, proposal, service, own, "Como está o INC-ONE?")
    assert data["tickets"][0]["code"] == "INC-ONE"
    _, data = apply_proposal(database, user, conv, proposal, service, own, "Consultar meus chamados")
    assert conv.selected_ticket_id is None
    assert data["ticket_selection"]
    assert [t["code"] for t in data["tickets"]] == ["INC-ONE"]
    _, data = apply_proposal(database, user, conv, proposal, service, own, "Ver chamados resolvidos")
    assert [t["code"] for t in data["tickets"]] == ["INC-DONE"]
    reply, data = apply_proposal(database, user, conv, proposal, service, own, "INC-DONE")
    assert "resolvido" in reply
    assert data["quickReplies"][0] == "O problema voltou"
    assert data["tickets"][0]["overdue"] is False


def test_other_owner_protocol_does_not_reveal_or_fall_back_to_selection(database):
    user, conv, service, proposal = context(database)
    own = service.list()
    conv.selected_ticket_id = own[0].id
    reply, data = apply_proposal(database, user, conv, proposal, service, own, "Status do INC-SECRET")
    assert "seus chamados" in reply
    assert "tickets" not in data
    assert "Privado" not in str(data)


def test_single_ticket_is_explicitly_selectable(database):
    user, conv, service, proposal = context(database)
    _, data = apply_proposal(
        database, user, conv, proposal, service, service.list(), "Consultar meus chamados"
    )
    assert len(data["tickets"]) == 1
    assert data["ticket_selection"] is True
