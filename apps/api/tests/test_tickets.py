from datetime import timedelta

from sqlalchemy import func, select

from conftest import login
from nexo.config import settings
from nexo.models import Conversation, Draft, Ticket, now
from nexo.models import User
from nexo.ticket_service import TicketService


def pending(database, owner="alice", target=None):
    conv = Conversation(user_id=owner)
    database.add(conv)
    database.flush()
    draft = Draft(conversation_id=conv.id, user_id=owner,
                  operation="REOPEN" if target and target.status=="RESOLVED" else "UPDATE" if target else "CREATE",
                  target_id=target.id if target else None, target_version=target.version if target else None,
                  payload={"title":"VPN erro 809 no notebook", "description":"Windows 11 sem conexão desde ontem.",
                           "category":"Rede e VPN", "priority":"HIGH", "kind":"INC", "affected_scope":"individual"},
                  expires_at=now()+timedelta(hours=1))
    database.add(draft)
    database.commit()
    return draft


def test_confirmation_idempotent_and_private(client, database):
    draft = pending(database)
    login(client, "bob")
    assert client.post(f"/drafts/{draft.id}/confirm", json={"revision":1}).status_code == 404
    login(client)
    assert database.scalar(select(func.count()).select_from(Ticket)) == 0
    first = client.post(f"/drafts/{draft.id}/confirm", json={"revision":1})
    second = client.post(f"/drafts/{draft.id}/confirm", json={"revision":1})
    assert first.status_code == second.status_code == 200
    assert first.json()["ticket"]["id"] == second.json()["ticket"]["id"]
    assert database.scalar(select(func.count()).select_from(Ticket)) == 1
    login(client, "bob")
    assert client.get(f"/tickets/{first.json()['ticket']['id']}").status_code == 404


def test_edit_revision_cancel_and_after_commit_retry(client, database, monkeypatch):
    login(client)
    draft = pending(database)
    result = client.patch(f"/drafts/{draft.id}", json={"revision":1,"title":"VPN indisponível", "description":"Falha desde ontem, Windows 11."})
    assert result.json()["revision"] == 2
    assert client.post(f"/drafts/{draft.id}/confirm",json={"revision":1}).status_code == 409
    monkeypatch.setattr(settings, "ticket_failure_mode", "after_commit")
    assert client.post(f"/drafts/{draft.id}/confirm",json={"revision":2}).status_code == 503
    assert client.post(f"/drafts/{draft.id}/confirm",json={"revision":2}).status_code == 200
    assert database.scalar(select(func.count()).select_from(Ticket)) == 1
    draft2 = pending(database)
    assert client.post(f"/drafts/{draft2.id}/cancel",json={"revision":1}).status_code == 200
    assert client.post(f"/drafts/{draft2.id}/confirm",json={"revision":1}).status_code == 409


def test_complement_does_not_reset_overdue_sla(client, database):
    login(client)
    deadline = now()-timedelta(days=1)
    ticket = Ticket(code="INC-123", user_id="alice", title="VPN erro 809", description="Original",kind="INC",
                    category="Rede e VPN",priority="HIGH",due_at=deadline)
    database.add(ticket)
    database.commit()
    draft = pending(database,target=ticket)
    response = client.post(f"/drafts/{draft.id}/confirm",json={"revision":1})
    assert response.status_code == 200
    assert response.json()["ticket"]["overdue"] is True
    assert response.json()["ticket"]["due_at"] == deadline.isoformat()


def test_recent_resolved_reopens_and_duplicate_prepares_update(client, database):
    login(client)
    ticket = Ticket(code="INC-321",user_id="alice",title="VPN erro 809 no notebook",description="Resolvido antes",
                    kind="INC",category="Rede e VPN",priority="HIGH",status="RESOLVED",
                    resolved_at=now()-timedelta(days=4),due_at=now()-timedelta(days=3))
    database.add(ticket)
    database.commit()
    draft = pending(database,target=ticket)
    result=client.post(f"/drafts/{draft.id}/confirm",json={"revision":1})
    assert result.status_code==200
    assert result.json()["ticket"]["code"]=="INC-321"
    assert result.json()["ticket"]["status"]=="OPEN"
    conv=database.get(Conversation,draft.conversation_id)
    next_draft=TicketService(database,database.get(User,"alice")).prepare(conv,draft.payload)
    assert next_draft.operation=="UPDATE"
    assert next_draft.target_id==ticket.id
