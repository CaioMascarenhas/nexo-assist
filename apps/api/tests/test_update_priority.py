from datetime import timedelta
import pytest

from conftest import login
from nexo.chat_routes import apply_proposal
from nexo.domain import due_at
from nexo.models import Conversation, Ticket, User, now
from nexo.schemas import FollowUp, Proposal
from nexo.ticket_service import TicketService
from sqlalchemy import select
from nexo.models import Draft


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
    assert response.json()["ticket"]["due_at"] == due_at(anchor, "HIGH").isoformat()
    assert ticket.priority == "HIGH"
    assert conv.state == "WAITING_ANALYST"
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


def test_update_without_review_cannot_silently_lower_existing_priority(client, database):
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


def update_proposal(facts=None, intent="update"):
    return Proposal(
        intent=intent,
        facts=facts or {},
        reply="",
        confidence=0.95,
        rationale="Complemento solicitado",
        mode="stub",
        article_ids=["vpn-809"],
    )


def test_vpn_add_information_skips_os_and_keeps_actual_complement(database):
    user, ticket, conv = setup(database)
    ticket.category = "Rede e VPN"
    conv.facts = {"category": "Rede e VPN"}
    service = TicketService(database, user)
    reply, data = apply_proposal(
        database, user, conv, update_proposal(intent="help"), service, [ticket], "Adicionar informação"
    )
    assert "Qual informação" in reply
    assert "sistema operacional" not in reply
    assert "draft" not in data
    _, data = apply_proposal(
        database,
        user,
        conv,
        update_proposal(intent="create"),
        service,
        [ticket],
        "O erro começou depois da atualização de ontem",
    )
    assert data["draft"]["operation"] == "UPDATE"
    assert data["draft"]["target_id"] == ticket.id
    assert data["draft"]["payload"]["description"] == "O erro começou depois da atualização de ontem"
    assert ticket.description == "Lentidão inicial"


def test_lost_workaround_preserves_text_across_clarification_and_escalates_team(client, database):
    user, ticket, conv = setup(database)
    ticket.category = "Rede e VPN"
    ticket.affected_scope = "team"
    conv.facts = {"workaround": True, "blocked": False, "same_day": False}
    service = TicketService(database, user)
    apply_proposal(database, user, conv, update_proposal(), service, [ticket], "Adicionar informação")
    reply, data = apply_proposal(
        database,
        user,
        conv,
        update_proposal({"blocked": False}),
        service,
        [ticket],
        "Agora eu não tenho mais alternativa",
    )
    assert "Sem a alternativa" in reply
    assert conv.facts["workaround"] is False
    assert "blocked" not in conv.facts
    assert "draft" not in data
    # An irrelevant clarification must not silently finish the incomplete update.
    reply, data = apply_proposal(
        database, user, conv, update_proposal({"os": "Windows 11"}), service, [ticket], "Windows 11"
    )
    assert "Sem a alternativa" in reply
    assert "draft" not in data
    _, data = apply_proposal(
        database, user, conv, update_proposal({"blocked": True}), service, [ticket], "Não consigo trabalhar"
    )
    payload = data["draft"]["payload"]
    assert payload["description"] == "Agora eu não tenho mais alternativa\nWindows 11\nNão consigo trabalhar"
    assert payload["category"] == ticket.category
    assert payload["affected_scope"] == "team"
    assert payload["priority"] == "CRITICAL"
    assert conv.state == "WAITING_ANALYST"
    assert ticket.priority == "MEDIUM"
    assert ticket.description == "Lentidão inicial"
    database.commit()
    login(client)
    confirmed = client.post(f"/drafts/{data['draft']['id']}/confirm", json={"revision": 1})
    assert confirmed.status_code == 200
    assert confirmed.json()["ticket"]["priority"] == "CRITICAL"
    assert "Agora eu não tenho mais alternativa" in confirmed.json()["ticket"]["description"]


def test_leaving_complement_discards_buffer_instead_of_leaking_to_another_request(database):
    user, ticket, conv = setup(database)
    service = TicketService(database, user)
    conv.facts = {
        "_pending_update": True,
        "_update_text": "Relato anterior",
        "_awaiting_update_blocked": True,
    }
    apply_proposal(
        database, user, conv, update_proposal(intent="consult"), service, [ticket], "Consultar status"
    )
    assert not any(
        key in conv.facts for key in ("_pending_update", "_update_text", "_awaiting_update_blocked")
    )
    assert database.scalar(select(Draft)) is None


@pytest.mark.parametrize(
    "previous,scope,facts,expected",
    [
        ("HIGH", "individual", {"same_day": False, "blocked": False, "workaround": True}, "MEDIUM"),
        ("MEDIUM", "individual", {"same_day": True}, "HIGH"),
        ("HIGH", "individual", {"same_day": False, "blocked": True}, "HIGH"),
        ("CRITICAL", "individual", {"blocked": True}, "HIGH"),
        ("HIGH", "team", {"blocked": True}, "CRITICAL"),
    ],
)
def test_reassessment_moves_both_directions_only_after_confirmation(
    client, database, previous, scope, facts, expected
):
    user, ticket, conv = setup(database)
    ticket.priority = previous
    anchor = ticket.support_updated_at
    old_description = ticket.description
    proposal = update_proposal({**facts, "affected_scope": scope})
    proposal.update_summary = "A situação mudou e o impacto atual foi esclarecido pelo funcionário."
    _, data = apply_proposal(
        database,
        user,
        conv,
        proposal,
        TicketService(database, user),
        [ticket],
        "A reunião foi cancelada; segue o impacto atual.",
    )
    draft = data["draft"]
    assert draft["payload"]["priority"] == expected
    review = draft["payload"]["priority_review"]
    assert review["previous"] == previous
    assert review["proposed"] == expected
    assert "Prioridade" in review["reason"]
    assert ticket.priority == previous
    assert ticket.description == old_description
    database.commit()
    login(client)
    response = client.post(f"/drafts/{draft['id']}/confirm", json={"revision": 1})
    assert response.status_code == 200, response.text
    result = response.json()["ticket"]
    assert result["priority"] == expected
    assert ticket.support_updated_at == anchor
    if previous != expected:
        assert result["due_at"] == due_at(anchor, expected).isoformat()
    assert result["description"].startswith(old_description)
    assert any(update.get("priority_review") == review for update in result["updates"])
    replay = client.post(f"/drafts/{draft['id']}/confirm", json={"revision": 1})
    assert replay.json()["ticket"]["version"] == result["version"]


def test_model_collects_announced_information_and_asks_contextual_missing_fact(database):
    user, ticket, conv = setup(database)
    ticket.priority = "HIGH"
    service = TicketService(database, user)
    older = service.prepare(
        conv,
        {
            "title": ticket.title,
            "description": "Informação anterior",
            "kind": ticket.kind,
            "category": ticket.category,
            "priority": ticket.priority,
            "affected_scope": ticket.affected_scope,
        },
        ticket,
    )
    proposal = update_proposal()
    proposal.collect_update = True
    proposal.follow_up = FollowUp(
        **{
            "field": "update_details",
            "question": "O que mudou desde o atendimento com Rafael?",
        }
    )
    # Use validated structured output exactly as the live adapter does.
    proposal = Proposal.model_validate(proposal.model_dump())
    reply, data = apply_proposal(
        database, user, conv, proposal, service, [ticket], "Queria te contar uma novidade sobre esse problema"
    )
    assert reply == "O que mudou desde o atendimento com Rafael?"
    assert "draft" not in data
    assert older.status == "INVALIDATED"
    proposal = update_proposal({"same_day": False})
    proposal.follow_up = FollowUp(
        **{
            "field": "blocked",
            "question": "Com o cancelamento da reunião, você consegue continuar trabalhando?",
        }
    )
    proposal = Proposal.model_validate(proposal.model_dump())
    reply, data = apply_proposal(database, user, conv, proposal, service, [ticket], "A reunião foi cancelada")
    assert reply == "Com o cancelamento da reunião, você consegue continuar trabalhando?"
    assert "draft" not in data
    assert ticket.priority == "HIGH"
    _, data = apply_proposal(
        database,
        user,
        conv,
        update_proposal({"blocked": False, "workaround": True}),
        service,
        [ticket],
        "Consigo trabalhar, tenho alternativa",
    )
    assert data["draft"]["payload"]["priority"] == "MEDIUM"
    assert "A reunião foi cancelada" in data["draft"]["payload"]["description"]


def test_model_question_is_ignored_when_it_does_not_match_missing_fact(database):
    user, ticket, conv = setup(database)
    proposal = update_proposal({"same_day": False})
    proposal.follow_up = FollowUp(field="workaround", question="Existe uma alternativa?")
    proposal = Proposal.model_validate(proposal.model_dump())
    reply, data = apply_proposal(
        database, user, conv, proposal, TicketService(database, user), [ticket], "A reunião foi cancelada"
    )
    assert "impede você de trabalhar" in reply
    assert "draft" not in data
