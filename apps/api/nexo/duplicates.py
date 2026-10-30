"""Análise semântica consultiva; identidade e escritas continuam sob controle da API."""

import re
import unicodedata
from dataclasses import dataclass

from .models import Ticket


def normalized(text: str) -> str:
    text = "".join(c for c in unicodedata.normalize("NFD", text.casefold()) if not unicodedata.combining(c))
    return " ".join(re.findall(r"[a-z0-9]+", text))


def candidate_json(ticket: Ticket) -> dict:
    return {
        key: getattr(ticket, key)
        for key in (
            "id",
            "code",
            "title",
            "category",
            "kind",
            "version",
            "status",
        )
    } | {"description": ticket.description[:2000]}


def versions(candidates: list[dict]) -> dict:
    return {candidate["id"]: candidate["version"] for candidate in candidates}


def duplicate_answer(conv, content: str) -> dict | None:
    pending = conv.facts.get("_duplicate_question")
    if not pending:
        return None
    text = normalized(content)
    chosen = next(
        (
            candidate
            for candidate in pending["candidates"]
            if text == normalized(f"É o mesmo chamado {candidate['code']}")
        ),
        None,
    )
    if text in {"sim", "e o mesmo assunto", "e o mesmo chamado"} and len(pending["candidates"]) == 1:
        chosen = pending["candidates"][0]
    different = text in {"e um novo pedido", "e outro pedido", "e outro assunto", "nao"}
    if not chosen and not different:
        return None
    choice = {
        **pending,
        "result": "same" if chosen else "different",
        "ticket_id": chosen["id"] if chosen else None,
    }
    conv.facts = {key: value for key, value in conv.facts.items() if key != "_duplicate_question"}
    conv.facts = {**conv.facts, "_duplicate_choice": choice}
    return choice


def supported_evidence(review, request_text: str, candidate: dict) -> bool:
    """Trechos precisam existir nas fontes; a identidade citada deve coincidir."""
    aspects = set()
    excerpts = set()
    identity = False
    generic = {
        "software",
        "programa",
        "sistema",
        "equipamento",
        "computador",
        "notebook",
        "impressora",
        "acesso",
        "instalar",
        "instalacao",
        "pedido",
        "solicitacao",
        "para",
        "do",
        "de",
        "da",
        "o",
        "a",
        "com",
        "sem",
        "falha",
        "problema",
        "erro",
    }
    for evidence in review.evidence:
        request_quote = normalized(evidence.request_quote)
        ticket_quote = normalized(evidence.ticket_quote)
        if not request_quote or not ticket_quote:
            return False
        if f" {request_quote} " not in f" {normalized(request_text)} ":
            return False
        if f" {ticket_quote} " not in f" {normalized(candidate['title'] + ' ' + candidate['description'])} ":
            return False
        aspects.add(evidence.aspect)
        excerpts.add((request_quote, ticket_quote))
        if evidence.aspect in {"system", "equipment"}:
            if request_quote == ticket_quote and set(request_quote.split()) - generic:
                identity = True
    return identity and len(aspects) >= 2 and len(excerpts) >= 2


@dataclass
class DuplicateDecision:
    target: Ticket | None = None
    question: str | None = None
    review: dict | None = None


def assess_duplicate(service, conv, payload, proposal, snapshots, data) -> DuplicateDecision:
    eligible = service.duplicate_candidates(payload["category"], payload["kind"])
    current = [candidate_json(ticket) for ticket in eligible]
    snapshots = current if snapshots is None else snapshots
    reviewed = [
        candidate
        for candidate in snapshots or []
        if candidate["category"] == payload["category"] and candidate["kind"] == payload["kind"]
    ]
    context = {
        "category": payload["category"],
        "kind": payload["kind"],
        "title": payload["title"],
        "candidates": current,
    }
    choice = conv.facts.get("_duplicate_choice")
    source, target, reason = "agent", None, "Não há chamados elegíveis para este pedido."
    valid = versions(reviewed) == versions(current)
    if choice and all(choice.get(key) == context[key] for key in ("category", "kind", "title")):
        valid = versions(choice["candidates"]) == versions(current)
        source = "user"
        if choice["result"] == "same":
            target = next((ticket for ticket in eligible if ticket.id == choice["ticket_id"]), None)
            valid = valid and target is not None
        reason = (
            "O funcionário confirmou que é o mesmo assunto."
            if target
            else "O funcionário informou que é um novo pedido."
        )
    elif eligible:
        reviews = {review.ticket_id: review for review in proposal.duplicate_reviews}
        # IDs fora do snapshot ou entradas repetidas nunca autorizam associação.
        valid = valid and len(reviews) == len(proposal.duplicate_reviews)
        valid = valid and set(reviews).issubset({candidate["id"] for candidate in snapshots or []})
        relevant = [reviews.get(ticket.id) for ticket in eligible]
        valid = valid and all(review and review.result != "uncertain" for review in relevant)
        same = [review for review in relevant if review and review.result == "same"]
        valid = valid and len(same) <= 1
        if same:
            target = next(ticket for ticket in eligible if ticket.id == same[0].ticket_id)
            snapshot = next(candidate for candidate in current if candidate["id"] == target.id)
            request_text = "\n".join(conv.facts.get("_triage_reports", []))
            valid = valid and supported_evidence(same[0], request_text, snapshot)
            reason = same[0].reason
        else:
            reason = "A análise dos chamados elegíveis indicou assuntos diferentes."
    if not valid:
        # Invalida qualquer rascunho anterior no chamador antes de pedir a escolha.
        conv.facts = {key: value for key, value in conv.facts.items() if key != "_duplicate_choice"}
        conv.facts = {**conv.facts, "_duplicate_question": context}
        judgments = {review.ticket_id: review.result for review in proposal.duplicate_reviews}
        options = [
            candidate for candidate in current if judgments.get(candidate["id"]) != "different"
        ] or current
        data["quickReplies"] = [f"É o mesmo chamado {candidate['code']}" for candidate in options] + [
            "É um novo pedido"
        ]
        listing = "\n".join(f"• {candidate['code']}: {candidate['title']}" for candidate in options)
        question = "Preciso confirmar o assunto antes de vincular um protocolo.\n" + listing
        question += "\nÉ o mesmo assunto de algum desses chamados ou é um novo pedido?"
        return DuplicateDecision(question=question)
    conv.facts = {key: value for key, value in conv.facts.items() if key != "_duplicate_question"}
    return DuplicateDecision(
        target=target,
        review={
            "source": source,
            "result": "same" if target else "different",
            "reason": reason,
            "requested_title": payload["title"],
            "candidates": [{"id": item["id"], "version": item["version"]} for item in current],
            "reviews": [review.model_dump() for review in proposal.duplicate_reviews]
            if source == "agent"
            else [],
        },
    )
