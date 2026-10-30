from datetime import timedelta

import pytest
from sqlalchemy import select

from conftest import login
from nexo import chat_routes
from nexo.duplicates import candidate_json
from nexo.models import Conversation, Draft, Ticket, User, now
from nexo.schemas import DuplicateReview, Proposal
from nexo.ticket_service import TicketService


REQUEST = "Preciso instalar QGIS para mapas geológicos. Só eu, sem compromisso em risco e posso continuar trabalhando."


def setup(database, title="Instalação do software QGIS", owner="alice"):
    ticket = Ticket(
        code=f"REQ-{owner.upper()}",
        user_id=owner,
        title=title,
        description="Instalar QGIS para mapas geológicos.",
        kind="REQ",
        category="Software",
        priority="LOW",
        due_at=now() + timedelta(days=5),
    )
    conv = Conversation(user_id="alice")
    database.add_all([ticket, conv])
    database.flush()
    user = database.get(User, "alice")
    return ticket, conv, user, TicketService(database, user)


def review(ticket, result="same", **changes):
    return DuplicateReview.model_validate(
        {
            "ticket_id": ticket.id,
            "result": result,
            "reason": "Mesmo programa QGIS e objetivo de produzir mapas geológicos.",
            "evidence": [
                {"aspect": "system", "request_quote": "QGIS", "ticket_quote": "QGIS"},
                {
                    "aspect": "objective",
                    "request_quote": "mapas geológicos",
                    "ticket_quote": "mapas geológicos",
                },
            ]
            if result == "same"
            else [],
            **changes,
        }
    )


def proposal(reviews=(), **changes):
    return Proposal.model_validate(
        {
            "intent": "create",
            "reply": "",
            "confidence": 0.95,
            "rationale": "Pedido de instalação",
            "facts": {
                "title": "QGIS para elaborar mapas geológicos",
                "category": "Software",
                "kind": "REQ",
                "affected_scope": "individual",
                "blocked": False,
                "same_day": False,
                "workaround": True,
            },
            "duplicate_reviews": reviews,
            **changes,
        }
    )


def apply(database, conv, user, service, request, snapshots, content=REQUEST):
    return chat_routes.apply_proposal(
        database, user, conv, request, service, service.list(), content, snapshots
    )


def test_semantic_match_of_different_titles_waits_for_confirmation_and_keeps_protocol(client, database):
    ticket, conv, user, service = setup(database)
    before = ticket.description
    _, data = apply(database, conv, user, service, proposal([review(ticket)]), [candidate_json(ticket)])
    assert data["draft"]["operation"] == "UPDATE"
    assert data["draft"]["target_code"] == ticket.code
    assert data["draft"]["payload"]["title"] == ticket.title
    assert data["draft"]["payload"]["duplicate_review"]["source"] == "agent"
    assert ticket.description == before
    database.commit()
    login(client)
    result = client.post(f"/drafts/{data['draft']['id']}/confirm", json={"revision": 1})
    assert result.status_code == 200, result.text
    assert result.json()["ticket"]["id"] == ticket.id
    assert REQUEST in result.json()["ticket"]["description"]
    assert client.post(f"/drafts/{data['draft']['id']}/confirm", json={"revision": 1}).status_code == 200


@pytest.mark.parametrize("equal_title", [False, True])
def test_different_subject_creates_separate_ticket_even_with_equal_title(client, database, equal_title):
    ticket, conv, user, service = setup(
        database, "Pedido de instalação" if equal_title else "Instalação do software FluxogramaQA"
    )
    ticket.description = "Instalar FluxogramaQA para diagramas de processos."
    before = ticket.description
    request = proposal(
        [
            review(
                ticket,
                "different",
                reason="QGIS é outro programa; o protocolo existente trata de FluxogramaQA.",
            )
        ]
    )
    if equal_title:
        request.facts["title"] = ticket.title
    _, data = apply(database, conv, user, service, request, [candidate_json(ticket)])
    assert data["draft"]["operation"] == "CREATE"
    database.commit()
    login(client)
    result = client.post(f"/drafts/{data['draft']['id']}/confirm", json={"revision": 1})
    assert result.status_code == 200, result.text
    assert result.json()["ticket"]["id"] != ticket.id
    database.refresh(ticket)
    assert ticket.description == before
    assert ticket.updates == []


@pytest.mark.parametrize(
    "invalid", ["missing", "uncertain", "invented", "generic", "foreign", "conflicting_identity"]
)
def test_unproven_match_asks_employee_and_never_mutates_ticket(database, invalid):
    ticket, conv, user, service = setup(database)
    item = review(ticket)
    if invalid == "uncertain":
        item.result = "uncertain"
    if invalid == "invented":
        item.evidence[0].ticket_quote = "ArcGIS inventado"
    if invalid == "generic":
        item.evidence[0].request_quote = item.evidence[0].ticket_quote = "instalar"
    if invalid == "foreign":
        item.ticket_id = "protocolo-de-outro-funcionario"
    if invalid == "conflicting_identity":
        ticket.title = "Instalação do software FluxogramaQA"
        ticket.description = "Instalar FluxogramaQA para mapas geológicos."
        item.evidence[0].ticket_quote = "FluxogramaQA"
    reply, data = apply(
        database,
        conv,
        user,
        service,
        proposal([] if invalid == "missing" else [item]),
        [candidate_json(ticket)],
    )
    assert "É o mesmo assunto" in reply
    assert ticket.code in reply
    assert "protocolo-de-outro-funcionario" not in reply
    assert "draft" not in data
    assert database.scalar(select(Draft)) is None
    assert ticket.updates == []
    assert conv.selected_ticket_id is None


@pytest.mark.parametrize("same", [True, False])
def test_employee_resolves_uncertainty_without_model_overriding_the_choice(client, database, same):
    ticket, conv, user, service = setup(database)
    snapshot = [candidate_json(ticket)]
    apply(database, conv, user, service, proposal([review(ticket, "uncertain")]), snapshot)
    answer = f"É o mesmo chamado {ticket.code}" if same else "É um novo pedido"
    # Um modelo inseguro ou uma classificação errada do clique não muda a escolha explícita.
    _, data = apply(
        database,
        conv,
        user,
        service,
        proposal(confidence=0.1, intent="out_of_scope", facts={}),
        snapshot,
        answer,
    )
    assert data["draft"]["operation"] == ("UPDATE" if same else "CREATE")
    assert data["draft"]["payload"]["duplicate_review"]["source"] == "user"
    database.commit()
    login(client)
    result = client.post(f"/drafts/{data['draft']['id']}/confirm", json={"revision": 1})
    assert result.status_code == 200, result.text
    assert (result.json()["ticket"]["id"] == ticket.id) is same


def test_candidate_changed_during_analysis_requires_clarification(database):
    ticket, conv, user, service = setup(database)
    snapshot = [candidate_json(ticket)]
    ticket.version += 1
    database.flush()
    _, data = apply(database, conv, user, service, proposal([review(ticket)]), snapshot)
    assert "draft" not in data
    assert conv.facts["_duplicate_question"]["candidates"][0]["version"] == ticket.version


def test_candidate_added_before_confirmation_requires_new_review_and_preserves_draft(client, database):
    ticket, conv, user, service = setup(database)
    _, data = apply(
        database, conv, user, service, proposal([review(ticket, "different")]), [candidate_json(ticket)]
    )
    other = Ticket(
        code="REQ-NEW",
        user_id=user.id,
        title="Outro título sobre QGIS",
        description="Mapas",
        kind="REQ",
        category="Software",
        priority="LOW",
        due_at=now(),
    )
    database.add(other)
    database.commit()
    login(client)
    response = client.post(f"/drafts/{data['draft']['id']}/confirm", json={"revision": 1})
    assert response.status_code == 409
    assert "nova revisão de duplicidade" in response.json()["detail"]
    assert database.get(Draft, data["draft"]["id"]).status == "PENDING"
    assert len(service.list()) == 2


def test_critical_uncertainty_hands_off_without_guessing_protocol(database):
    ticket, conv, user, service = setup(database)
    request = proposal([review(ticket, "uncertain")])
    request.facts.update({"affected_scope": "team", "blocked": True})
    _, data = apply(database, conv, user, service, request, [candidate_json(ticket)])
    assert conv.state == "WAITING_ANALYST"
    assert conv.handoff_reason == "CRITICAL"
    assert conv.selected_ticket_id is None
    assert "draft" not in data
    assert ticket.updates == []


def test_candidates_exclude_other_owners_old_resolutions_categories_and_types(database):
    ticket, conv, user, service = setup(database)
    private, _, _, _ = setup(database, owner="bob")
    assert [item.id for item in service.duplicate_candidates("Software", "REQ")] == [ticket.id]
    assert service.duplicate_candidates("Hardware", "REQ") == []
    assert service.duplicate_candidates("Software", "INC") == []
    ticket.status, ticket.resolved_at = "RESOLVED", now() - timedelta(days=8)
    database.flush()
    assert service.duplicate_candidates() == []
    assert private.user_id != user.id
