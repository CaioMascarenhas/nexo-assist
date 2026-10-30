from datetime import timedelta

import pytest
from sqlalchemy import select

from conftest import login
from nexo.chat_routes import apply_proposal
from nexo.models import Conversation, Draft, LoginSession, Ticket, User, now
from nexo.schemas import Proposal
from nexo.ticket_service import TicketService


@pytest.mark.parametrize(
    "intent,facts,confidence,reason",
    [
        ("handoff", {}, 0.9, "USER_REQUEST"),
        ("create", {"affected_scope": "team", "blocked": True}, 0.9, "CRITICAL"),
        ("clarify", {}, 0.4, "LOW_CONFIDENCE"),
    ],
)
def test_required_transfers_preserve_context_without_unconfirmed_ticket(
    database, intent, facts, confidence, reason
):
    user = database.get(User, "alice")
    conv = Conversation(user_id=user.id)
    database.add(conv)
    database.flush()
    reply, data = apply_proposal(
        database,
        user,
        conv,
        Proposal(
            intent=intent,
            facts=facts,
            confidence=confidence,
            reply="",
            rationale="Evidência do cenário",
            mode="stub",
        ),
        TicketService(database, user),
        [],
        "Problema que exige suporte",
    )
    assert conv.state == "WAITING_ANALYST"
    assert conv.handoff_reason == reason
    assert "Problema que exige suporte" in conv.summary
    assert "pausado" in reply
    assert database.scalar(select(Draft)) is None
    assert database.scalar(select(Ticket)) is None
    assert reason in data["decision"]["rules"]


@pytest.mark.parametrize(
    "scope,blocked,same_day,workaround,expected",
    [
        ("individual", True, False, False, "HIGH"),
        ("individual", False, True, True, "HIGH"),
        ("individual", False, False, True, "MEDIUM"),
        ("individual", False, False, False, "LOW"),
    ],
)
def test_draft_keeps_priority_and_all_required_fields_before_confirmation(
    database, scope, blocked, same_day, workaround, expected
):
    user = database.get(User, "alice")
    conv = Conversation(user_id=user.id)
    database.add(conv)
    database.flush()
    facts = {
        "title": "Software de relatórios",
        "description": "Programa não abre desde ontem",
        "kind": "INC",
        "category": "Software",
        "affected_scope": scope,
        "blocked": blocked,
        "same_day": same_day,
        "workaround": workaround,
    }
    _, data = apply_proposal(
        database,
        user,
        conv,
        Proposal(
            intent="create",
            facts=facts,
            confidence=0.9,
            reply="",
            rationale="Impacto e urgência confirmados",
            mode="stub",
        ),
        TicketService(database, user),
        [],
        "Falha no programa",
    )
    payload = data["draft"]["payload"]
    assert payload["priority"] == expected
    assert all(
        payload[field]
        for field in ("title", "description", "kind", "category", "priority", "affected_scope", "due_at")
    )
    assert database.scalar(select(Ticket)) is None
    assert database.scalar(select(Draft)).status == "PENDING"
    assert conv.state == "AGENT_ACTIVE"
    assert conv.selected_ticket_id is None


def test_unknown_scope_is_asked_instead_of_assumed(database):
    user = database.get(User, "alice")
    conv = Conversation(user_id=user.id)
    database.add(conv)
    database.flush()
    proposal = Proposal(
        intent="create",
        facts={"title": "Programa falha", "category": "Software", "affected_scope": "everyone"},
        confidence=0.9,
        reply="",
        rationale="Impacto desconhecido",
        mode="stub",
    )
    reply, data = apply_proposal(
        database, user, conv, proposal, TicketService(database, user), [], "Programa falha"
    )
    assert "Quem está sendo afetado" in reply
    assert "draft" not in data


@pytest.mark.parametrize("same_day,priority", [(False, "MEDIUM"), (True, "HIGH")])
def test_workaround_preserves_impact_and_asks_only_missing_urgency(database, same_day, priority):
    user = database.get(User, "alice")
    conv = Conversation(user_id=user.id)
    database.add(conv)
    database.flush()
    service = TicketService(database, user)

    def ask(facts, content):
        return apply_proposal(
            database,
            user,
            conv,
            Proposal(
                intent="create",
                facts=facts,
                confidence=0.95,
                reply="",
                rationale="Dados fornecidos pelo usuário",
                mode="stub",
            ),
            service,
            [],
            content,
        )

    reply, data = ask(
        {
            "title": "Ajuda com a VPN",
            "category": "Rede e VPN",
            "os": "Windows 11",
            "affected_scope": "team",
            "blocked": False,
            "workaround": True,
        },
        "Minha equipe toda está com erro de VPN, mas tenho alternativa",
    )
    assert reply == "Mesmo com a alternativa, existe algum compromisso em risco hoje?"
    assert "draft" not in data
    assert "same_day" not in conv.facts
    assert database.scalar(select(Ticket)) is None
    reply_again, data = ask({"workaround": True}, "Tenho alternativa")
    assert reply_again == reply
    assert data["decision"]["facts"]["affected_scope"] == "team"
    assert data["decision"]["facts"]["blocked"] is False
    _, data = ask({"same_day": same_day}, "Há compromisso hoje" if same_day else "Sem compromisso hoje")
    assert data["draft"]["payload"]["priority"] == priority
    assert data["draft"]["payload"]["affected_scope"] == "team"
    assert database.scalar(select(Ticket)) is None


def test_known_absence_of_urgency_asks_only_missing_work_blockage(database):
    user = database.get(User, "alice")
    conv = Conversation(user_id=user.id)
    database.add(conv)
    database.flush()
    reply, data = apply_proposal(
        database,
        user,
        conv,
        Proposal(
            intent="create",
            facts={
                "title": "Falha no programa",
                "category": "Software",
                "affected_scope": "individual",
                "same_day": False,
            },
            confidence=0.9,
            reply="",
            rationale="Urgência conhecida",
            mode="stub",
        ),
        TicketService(database, user),
        [],
        "Sem compromisso em risco hoje",
    )
    assert reply == "Esse problema impede você de continuar trabalhando?"
    assert "draft" not in data


def test_daily_conversation_limit_preserves_existing_human_channel(client):
    login(client)
    created = [client.post("/conversations") for _ in range(10)]
    assert all(response.status_code == 200 for response in created)
    assert client.post("/conversations").status_code == 429
    conv = created[0].json()["id"]
    assert client.post(f"/conversations/{conv}/handoff").status_code == 200
    assert client.post(
        f"/conversations/{conv}/messages",
        json={"content": "Aguardando o suporte", "client_id": "quota-humano"},
    ).json()["agent_paused"]
    assert len(client.get("/conversations").json()) == 10


def test_expired_session_is_rejected_and_cookie_is_http_only(client, database):
    response = client.post("/auth/login", json={"email": "alice@nexo.com.br", "password": "qualquer senha"})
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    session = database.scalar(select(LoginSession))
    session.expires_at = now() - timedelta(seconds=1)
    database.commit()
    assert client.get("/me").status_code == 401
