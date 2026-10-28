from datetime import timedelta

from nexo.domain import due_at
from nexo.models import Conversation, Ticket, User, now
from nexo import ticket_service
from nexo.ticket_service import TicketService


def test_escalation_after_reopen_uses_new_cycle_without_faking_support_update(database, monkeypatch):
    new_cycle = now()
    monkeypatch.setattr(ticket_service, "now", lambda: new_cycle)
    old_support_update = new_cycle - timedelta(days=5)
    ticket = Ticket(
        code="INC-CICLO",
        user_id="alice",
        title="VPN não conecta",
        description="Resolvido anteriormente",
        kind="INC",
        category="Rede e VPN",
        priority="MEDIUM",
        status="RESOLVED",
        resolved_at=now() - timedelta(days=4),
        support_updated_at=old_support_update,
        due_at=now() - timedelta(days=4),
    )
    conv = Conversation(user_id="alice")
    database.add_all([ticket, conv])
    database.flush()
    service = TicketService(database, database.get(User, "alice"))
    payload = {
        "title": ticket.title,
        "description": "O problema voltou.",
        "kind": "INC",
        "category": "Rede e VPN",
        "priority": "MEDIUM",
        "affected_scope": "individual",
    }
    reopen = service.prepare(conv, payload, ticket)
    service.confirm(reopen, 1)
    database.flush()
    upgrade = service.prepare(
        conv, {**payload, "description": "Agora impede meu trabalho.", "priority": "HIGH"}, ticket
    )
    assert upgrade.payload["due_at"] == due_at(new_cycle, "HIGH").isoformat()
    service.confirm(upgrade, 1)
    assert ticket.due_at == due_at(new_cycle, "HIGH")
    assert ticket.due_at > new_cycle
    assert ticket.support_updated_at == old_support_update
