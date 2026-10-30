from datetime import timedelta

from conftest import login
from nexo.models import Conversation, Ticket, now


def claimed(client, database):
    login(client)
    conv_id = client.post("/conversations").json()["id"]
    ticket = Ticket(
        code="INC-RESOLVE",
        user_id="alice",
        title="Scanner",
        description="Sem conexão",
        kind="INC",
        category="Hardware",
        priority="HIGH",
        due_at=now() + timedelta(days=1),
    )
    database.add(ticket)
    database.flush()
    database.get(Conversation, conv_id).selected_ticket_id = ticket.id
    database.commit()
    waiting = client.post(f"/conversations/{conv_id}/handoff").json()
    login(client, "support")
    current = client.post(f"/analyst/conversations/{conv_id}/claim", json={"epoch": waiting["epoch"]}).json()
    database.refresh(ticket)
    body = {
        "epoch": current["epoch"],
        "ticket_id": ticket.id,
        "version": ticket.version,
        "resolution": "Reconectado em outra porta USB, funcionamento validado com o funcionário.",
    }
    return conv_id, ticket, body


def test_resolution_records_solution_without_closing_conversation(client, database):
    conv_id, ticket, body = claimed(client, database)
    response = client.post(f"/analyst/conversations/{conv_id}/resolve-ticket", json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["ticket"]["status"] == "RESOLVED"
    assert result["ticket"]["resolved_at"]
    assert result["ticket"]["updates"][-1]["type"] == "resolution"
    assert result["ticket"]["updates"][-1]["content"] == body["resolution"]
    assert result["conversation"]["state"] == "HUMAN_ACTIVE"
    assert database.get(Conversation, conv_id).facts == {}
    assert client.post(f"/analyst/conversations/{conv_id}/resolve-ticket", json=body).status_code == 409
    closed = client.post(f"/analyst/conversations/{conv_id}/close", json={"epoch": body["epoch"]})
    assert closed.json()["state"] == "CLOSED"
    database.refresh(ticket)
    assert ticket.status == "RESOLVED"
    login(client)
    history = client.get(f"/conversations/{conv_id}").json()
    assert any(body["resolution"] in m["content"] for m in history["messages"])


def test_resolution_requires_assignee_role_and_current_versions(client, database):
    conv_id, ticket, body = claimed(client, database)
    path = f"/analyst/conversations/{conv_id}/resolve-ticket"
    login(client, "support2")
    assert client.post(path, json=body).status_code == 409
    login(client)
    assert client.post(path, json=body).status_code == 403
    login(client, "support")
    assert client.post(path, json={**body, "epoch": body["epoch"] - 1}).status_code == 409
    assert client.post(path, json={**body, "version": body["version"] - 1}).status_code == 409
    assert client.post(path, json={**body, "ticket_id": "other-owner-ticket"}).status_code == 409
    assert client.post(path, json={**body, "resolution": "     "}).status_code == 422
    database.refresh(ticket)
    assert ticket.status == "IN_PROGRESS"
    assert ticket.resolved_at is None


def test_resolution_failure_keeps_ticket_and_human_channel(client, database, monkeypatch):
    from nexo.config import settings

    conv_id, ticket, body = claimed(client, database)
    monkeypatch.setattr(settings, "ticket_failure_mode", "always")
    assert client.post(f"/analyst/conversations/{conv_id}/resolve-ticket", json=body).status_code == 503
    database.refresh(ticket)
    assert ticket.status == "IN_PROGRESS"
    assert ticket.resolved_at is None
    assert database.get(Conversation, conv_id).state == "HUMAN_ACTIVE"
