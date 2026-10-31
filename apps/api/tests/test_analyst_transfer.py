from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from conftest import login
from nexo import chat_routes
from nexo.analyst_routes import transfer_analyst
from nexo.config import settings
from nexo.models import Conversation, Message, Ticket, User, now
from nexo.schemas import TransferAnalystBody
from nexo.ticket_service import ticket_json
from test_ticket_resolution import claimed


REASON = "Diagnóstico inicial concluído. É necessária análise especializada da conexão do scanner."


def body(current_epoch, **changes):
    return {"epoch": current_epoch, "target_analyst_id": "support2", "reason": REASON, **changes}


def test_transfer_assigns_directly_preserves_ticket_and_revokes_previous_owner(client, database, monkeypatch):
    conv_id, ticket, resolution = claimed(client, database)
    conv = database.get(Conversation, conv_id)
    conv.summary = "Contexto inicial preservado para o suporte."
    database.commit()
    before = ticket_json(ticket)
    path = f"/analyst/conversations/{conv_id}"
    result = client.post(f"{path}/transfer", json=body(resolution["epoch"]))
    assert result.status_code == 200, result.text
    current = result.json()
    assert current["state"] == "HUMAN_ACTIVE"
    assert current["analyst_id"] == "support2"
    assert current["assigned_analyst"]["name"] == "Support 2"
    assert current["epoch"] == resolution["epoch"] + 1
    assert "Contexto inicial preservado" in current["summary"]
    assert REASON in current["summary"]
    database.refresh(ticket)
    after = ticket_json(ticket)
    for key in ("id", "code", "title", "description", "status", "priority", "due_at", "support_updated_at"):
        assert after[key] == before[key]
    assert after["updates"][-1]["type"] == "analyst_transfer"
    assert after["updates"][-1]["content"] == REASON
    assert after["updates"][-1]["to_analyst_id"] == "support2"
    assert after["version"] == before["version"] + 1
    assert client.get("/analyst/conversations", params={"filter": "mine"}).json() == []
    for action in ("release", "close", "claim"):
        assert client.post(f"{path}/{action}", json={"epoch": current["epoch"]}).status_code == 409
    assert (
        client.post(f"{path}/messages", json={"content": "Resposta atrasada", "client_id": "old"}).status_code
        == 409
    )
    assert (
        client.post(f"{path}/resolve-ticket", json={**resolution, "epoch": current["epoch"]}).status_code
        == 409
    )

    login(client)

    async def should_not_run(_):
        raise AssertionError("A IA deve permanecer pausada durante a passagem humana.")

    monkeypatch.setattr(chat_routes, "request_proposal", should_not_run)
    employee_message = client.post(
        f"/conversations/{conv_id}/messages",
        json={"content": "Vou aguardar o novo analista.", "client_id": "paused"},
    )
    assert employee_message.json()["agent_paused"] is True
    history = client.get(f"/conversations/{conv_id}").json()
    assert history["assigned_analyst"]["id"] == "support2"
    assert any(REASON in message["content"] for message in history["messages"])
    login(client, "support2")
    mine = client.get("/analyst/conversations", params={"filter": "mine"}).json()
    assert [item["id"] for item in mine] == [conv_id]
    assert client.get("/analyst/conversations", params={"filter": "waiting"}).json() == []
    assert (
        client.post(
            f"{path}/messages",
            json={"content": "Recebi o contexto e vou continuar a análise.", "client_id": "new"},
        ).status_code
        == 200
    )
    database.refresh(ticket)
    assert (
        client.post(
            f"{path}/resolve-ticket",
            json={**resolution, "epoch": current["epoch"], "version": ticket.version},
        ).status_code
        == 200
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"target_analyst_id": "support"},
        {"target_analyst_id": "alice"},
        {"target_analyst_id": "inexistente"},
        {"reason": "   "},
        {"epoch": 0},
    ],
)
def test_invalid_transfer_keeps_original_owner_and_history(client, database, changes):
    conv_id, ticket, resolution = claimed(client, database)
    before = ticket_json(ticket)
    result = client.post(
        f"/analyst/conversations/{conv_id}/transfer", json=body(resolution["epoch"], **changes)
    )
    assert result.status_code in {409, 422}
    conv = database.get(Conversation, conv_id)
    assert conv.analyst_id == "support"
    assert conv.state == "HUMAN_ACTIVE"
    assert conv.epoch == resolution["epoch"]
    database.refresh(ticket)
    assert ticket_json(ticket) == before
    assert not any(
        message.data.get("operation") == "ANALYST_TRANSFER" for message in database.scalars(select(Message))
    )


def test_only_current_assignee_can_transfer_and_directory_excludes_employees(client, database):
    conv_id, ticket, resolution = claimed(client, database)
    directory = client.get("/analyst/colleagues")
    assert directory.status_code == 200
    assert [item["id"] for item in directory.json()] == ["support2"]
    assert "email" not in directory.json()[0]
    path = f"/analyst/conversations/{conv_id}/transfer"
    login(client, "support2")
    assert client.post(path, json=body(resolution["epoch"], target_analyst_id="support")).status_code == 409
    login(client)
    assert client.get("/analyst/colleagues").status_code == 403
    assert client.post(path, json=body(resolution["epoch"])).status_code == 403
    assert database.get(Conversation, conv_id).analyst_id == "support"


def test_transfer_without_protocol_keeps_the_same_human_conversation(client, database):
    login(client)
    conv_id = client.post("/conversations").json()["id"]
    waiting = client.post(f"/conversations/{conv_id}/handoff").json()
    login(client, "support")
    current = client.post(f"/analyst/conversations/{conv_id}/claim", json={"epoch": waiting["epoch"]}).json()
    result = client.post(f"/analyst/conversations/{conv_id}/transfer", json=body(current["epoch"]))
    assert result.status_code == 200
    assert result.json()["id"] == conv_id
    assert result.json()["state"] == "HUMAN_ACTIVE"
    assert result.json()["analyst_id"] == "support2"
    assert result.json()["selected_ticket_id"] is None


def test_transfer_continues_when_legacy_is_unavailable_and_explains_pending_record(
    client, database, monkeypatch
):
    conv_id, ticket, resolution = claimed(client, database)
    before = ticket_json(ticket)
    monkeypatch.setattr(settings, "ticket_failure_mode", "always")
    result = client.post(f"/analyst/conversations/{conv_id}/transfer", json=body(resolution["epoch"]))
    assert result.status_code == 200
    assert result.json()["analyst_id"] == "support2"
    database.refresh(ticket)
    assert ticket_json(ticket) == before
    messages = list(database.scalars(select(Message).where(Message.conversation_id == conv_id)))
    transfer = next(message for message in messages if message.data.get("operation") == "ANALYST_TRANSFER")
    assert transfer.data["ticket_sync_pending"] is True
    assert any("registro no chamado está indisponível" in message.content for message in messages)


def test_simultaneous_transfer_has_one_winner_and_one_history_record(client, database):
    conv_id, ticket, resolution = claimed(client, database)
    barrier = Barrier(2)

    def attempt(_):
        with Session(database.bind, expire_on_commit=False) as session:
            actor = session.get(User, "support")
            barrier.wait(timeout=5)
            try:
                transfer_analyst(conv_id, TransferAnalystBody(**body(resolution["epoch"])), session, actor)
                return 200
            except HTTPException as error:
                session.rollback()
                return error.status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(attempt, range(2)))
    assert sorted(results) == [200, 409]
    database.refresh(ticket)
    assert len([update for update in ticket.updates if update.get("type") == "analyst_transfer"]) == 1


@pytest.mark.parametrize("state", ["AGENT_ACTIVE", "WAITING_ANALYST", "CLOSED"])
def test_transfer_requires_an_active_human_assignment(client, database, state):
    conv_id, ticket, resolution = claimed(client, database)
    conv = database.get(Conversation, conv_id)
    conv.state, conv.analyst_id = state, None
    database.commit()
    response = client.post(f"/analyst/conversations/{conv_id}/transfer", json=body(conv.epoch))
    assert response.status_code == 409
    database.refresh(conv)
    assert conv.state == state
    assert conv.analyst_id is None


def test_resolved_protocol_remains_resolved_and_recipient_can_close_contact(client, database):
    conv_id, ticket, resolution = claimed(client, database)
    assert client.post(f"/analyst/conversations/{conv_id}/resolve-ticket", json=resolution).status_code == 200
    database.refresh(ticket)
    before = ticket_json(ticket)
    result = client.post(f"/analyst/conversations/{conv_id}/transfer", json=body(resolution["epoch"]))
    assert result.status_code == 200
    database.refresh(ticket)
    for key in ("status", "resolved_at", "due_at", "support_updated_at"):
        assert ticket_json(ticket)[key] == before[key]
    assert ticket.updates[-2]["type"] == "resolution"
    login(client, "support2")
    assert (
        client.post(
            f"/analyst/conversations/{conv_id}/close", json={"epoch": result.json()["epoch"]}
        ).status_code
        == 200
    )


def test_wrong_ticket_owner_rolls_back_transfer_instead_of_mixing_records(client, database):
    conv_id, ticket, resolution = claimed(client, database)
    private = Ticket(
        code="INC-BOB",
        user_id="bob",
        title="Outro funcionário",
        description="Privado",
        kind="INC",
        category="Hardware",
        priority="LOW",
        due_at=now(),
    )
    database.add(private)
    database.flush()
    conv = database.get(Conversation, conv_id)
    conv.selected_ticket_id = private.id
    database.commit()
    result = client.post(f"/analyst/conversations/{conv_id}/transfer", json=body(resolution["epoch"]))
    assert result.status_code == 404
    database.refresh(conv)
    database.refresh(private)
    assert conv.analyst_id == "support"
    assert conv.epoch == resolution["epoch"]
    assert private.updates == []
