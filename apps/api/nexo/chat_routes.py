import asyncio
import json
import re
import time
import unicodedata
from datetime import timedelta
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from .config import settings
from .conversation_routes import add_message, get_conversation, pause
from .domain import CATEGORIES, aware, priority_for
from .models import Article, Message, now
from .schemas import MessageBody, Proposal
from .security import Actor, DB
from .serialization import draft_json, message_json
from .ticket_service import TicketService, ticket_json

router = APIRouter()


def event(kind: str, data: Any) -> str:
    return "data: " + json.dumps({"type": kind, "data": data}, ensure_ascii=False) + "\n\n"


async def request_proposal(payload: dict[str, Any]) -> Proposal:
    if len(settings.internal_agent_secret) < 32:
        raise HTTPException(503, "Configure o segredo interno do serviço de agente.")
    async with httpx.AsyncClient(timeout=42) as client:
        response = await client.post(
            settings.agent_url + "/decide",
            json=payload,
            headers={"Authorization": "Bearer " + settings.internal_agent_secret},
        )
        response.raise_for_status()
        return Proposal.model_validate(response.json())


def apply_proposal(db, user, conv, proposal: Proposal, service: TicketService, own_tickets, content):
    allowed = {
        "os",
        "category",
        "title",
        "description",
        "kind",
        "affected_scope",
        "blocked",
        "same_day",
        "workaround",
    }
    facts = {**conv.facts, **{k: v for k, v in proposal.facts.items() if k in allowed and v is not None}}
    # Validate semantic domains independently of the provider's output schema.
    if facts.get("category") not in CATEGORIES:
        facts.pop("category", None)
    if facts.get("affected_scope") not in {"individual", "team", "company"}:
        facts.pop("affected_scope", None)
    for field in ("blocked", "same_day", "workaround"):
        if field in facts and not isinstance(facts[field], bool):
            facts.pop(field)
    conv.facts = facts
    decision: dict[str, Any] = {
        "intent": proposal.intent,
        "confidence": proposal.confidence,
        "confidence_source": "fixture" if proposal.mode == "stub" else "model_self_report",
        "calibrated": False,
        "rationale": proposal.rationale,
        "facts": {key: value for key, value in facts.items() if not key.startswith("_")},
        "actions": ["Consultou seus chamados", "Consultou a central de ajuda"],
        "tool_events": proposal.tool_events,
        "rules": ["OWNER_SCOPE", "CONFIRM_BEFORE_WRITE"],
        "sources": [],
        "usage": proposal.usage,
        "mode": proposal.mode,
        "prompt_version": "triage-v1",
    }
    data: dict[str, Any] = {"decision": decision}
    intent = proposal.intent
    text = "".join(
        c for c in unicodedata.normalize("NFD", content.casefold()) if not unicodedata.combining(c)
    )
    if facts.get("_vpn_guidance_offered") and (
        intent == "update"
        or any(term in text for term in ("nao resolveu", "nao funcionou", "continua sem funcionar"))
    ):
        facts["_vpn_guidance_failed"] = True
        conv.facts = {**facts}
    protocols = re.findall(r"\b(?:inc|req)-[a-z0-9]+(?:-[a-z0-9]+)*\b", text)
    if protocols:
        matching = [t for t in own_tickets if t.code.casefold() in protocols]
        if len(matching) != 1 or len(set(protocols)) != 1:
            return (
                "Não identifiquei um único protocolo entre os seus chamados. Consulte a lista e selecione um chamado.",
                data,
            )
        conv.selected_ticket_id = matching[0].id
        if intent not in {"update", "handoff", "out_of_scope"}:
            intent = "consult"
            decision["intent"] = intent
    elif intent == "consult" and any(
        word in text
        for word in (
            "meus chamados",
            "outro chamado",
            "todos os chamados",
            "chamados resolvidos",
            "chamados abertos",
        )
    ):
        conv.selected_ticket_id = None
    selected = service.get(conv.selected_ticket_id) if conv.selected_ticket_id else None
    if facts.get("_pending_update") and selected and intent not in {"handoff", "out_of_scope", "consult"}:
        intent = "update"
        decision["intent"] = "update"
        decision["rules"].append("PENDING_UPDATE_CONTEXT")
    if intent in {"handoff", "out_of_scope", "consult"}:
        conv.facts = {key: value for key, value in facts.items() if key != "_pending_update"}
    critical = facts.get("affected_scope") in {"team", "company"} and facts.get("blocked") is True
    if intent == "out_of_scope":
        return (
            "Posso ajudar com assuntos de TI. Para RH, financeiro ou facilities, procure o canal responsável da Nexo.",
            data,
        )
    if intent == "handoff" or critical or proposal.confidence < 0.75:
        reason = (
            "CRITICAL" if critical else "LOW_CONFIDENCE" if proposal.confidence < 0.75 else "USER_REQUEST"
        )
        pause(
            db,
            conv,
            reason,
            f"{content}\nFatos: {json.dumps(facts, ensure_ascii=False)}\n{proposal.rationale}",
        )
        if selected:
            service.transfer(selected.id, reason)
        decision["actions"].append("Transferiu para um analista")
        decision["rules"].append(reason)
        return (
            "Encaminhei sua conversa ao suporte com o contexto disponível. O assistente ficará pausado enquanto você aguarda um analista.",
            data,
        )
    if intent == "consult":
        if not selected:
            show_resolved = "resolvidos" in text
            show_all = "todos" in text
            data["tickets"] = [
                ticket_json(t)
                for t in own_tickets
                if show_all or ((t.status in {"RESOLVED", "CLOSED"}) == show_resolved)
            ]
            data["ticket_selection"] = True
            data["quickReplies"] = [
                "Consultar meus chamados",
                "Ver chamados resolvidos",
                "Ver todos os chamados",
            ]
            return (
                "Sobre qual chamado você quer saber? Selecione um abaixo."
                if data["tickets"]
                else "Você não tem chamados nesse filtro. Pode consultar abertos ou resolvidos."
            ), data
        result = ticket_json(selected)
        data["tickets"] = [result]
        if selected.status in {"RESOLVED", "CLOSED"}:
            data["quickReplies"] = ["O problema voltou", "Consultar meus chamados"]
            return (
                "Este chamado já foi resolvido. Se o problema voltou, posso conferir a possibilidade de reabertura e preparar um rascunho.",
                data,
            )
        if result["overdue"]:
            pause(
                db,
                conv,
                "OVERDUE",
                f"{selected.code}: {selected.title}. Prazo vencido em {selected.due_at.isoformat()}.",
            )
            service.transfer(selected.id, "OVERDUE")
            decision["actions"].append("Transferiu por prazo vencido")
            decision["rules"].append("OVERDUE_HANDOFF")
            return (
                "O prazo de atualização deste chamado venceu. Encaminhei a conversa para um analista e preservei o histórico.",
                data,
            )
        data["quickReplies"] = ["Adicionar informação", "Falar com um analista"]
        return (
            "Aqui está o status atualizado do seu chamado. O prazo mostrado é de resposta/atualização do suporte.",
            data,
        )
    articles = (
        list(db.scalars(select(Article).where(Article.id.in_(proposal.article_ids))))
        if proposal.article_ids
        else []
    )
    applicable = [a for a in articles if a.applies_to == "all" or a.applies_to == facts.get("os")]
    decision["sources"] = [
        {"id": a.id, "title": a.title, "content": a.content, "applicable": a in applicable} for a in articles
    ]
    vpn_failed = facts.get("_vpn_guidance_failed", False)
    if intent == "help" and applicable and not (vpn_failed and all(a.id == "vpn-809" for a in applicable)):
        return "\n\n".join(a.content for a in applicable), data
    if facts.get("category") == "Rede e VPN" and not facts.get("os"):
        data["quickReplies"] = ["Windows 10", "Windows 11", "Outro sistema"]
        return (
            "Qual é o sistema operacional do seu computador? O artigo de VPN erro 809 se aplica somente ao Windows 10.",
            data,
        )
    if (
        facts.get("os") == "Windows 10"
        and facts.get("category") == "Rede e VPN"
        and intent != "update"
        and not vpn_failed
    ):
        article = db.get(Article, "vpn-809")
        if article:
            conv.facts = {**facts, "_vpn_guidance_offered": True}
            decision["sources"] = [
                {"id": article.id, "title": article.title, "content": article.content, "applicable": True}
            ]
            data["quickReplies"] = ["Continua sem funcionar", "Falar com um analista"]
            return article.content, data
    if intent == "help" and not applicable:
        data["quickReplies"] = ["Abrir chamado", "Falar com um analista"]
        return (
            "Não encontrei uma orientação aplicável com segurança. Posso coletar os dados para um chamado ou chamar o suporte.",
            data,
        )
    if intent == "update" and selected:
        if content.casefold().strip() in {
            "adicionar informação",
            "adicionar informacao",
            "complementar chamado",
        }:
            conv.facts = {**facts, "_pending_update": True}
            return (
                "Qual informação você quer acrescentar ao chamado? Vou mostrar o complemento para sua confirmação.",
                data,
            )
        conv.facts = {key: value for key, value in facts.items() if key != "_pending_update"}
        payload = {
            "title": selected.title,
            "description": content,
            "kind": selected.kind,
            "category": selected.category,
            "priority": selected.priority,
            "affected_scope": selected.affected_scope,
        }
    else:
        if not facts.get("title") or not facts.get("category"):
            return (
                "Conte o que aconteceu, em qual equipamento ou sistema e desde quando. Assim consigo direcionar seu atendimento.",
                data,
            )
        if not facts.get("affected_scope"):
            data["quickReplies"] = ["Só eu", "Minha equipe", "Toda a empresa", "Não sei"]
            return "Quem está sendo afetado por esse problema?", data
        high_known = facts.get("blocked") is True or facts.get("same_day") is True
        if not high_known and ("blocked" not in facts or "same_day" not in facts):
            data["quickReplies"] = [
                "Não consigo trabalhar",
                "Tenho reunião hoje",
                "Tenho alternativa, sem urgência",
            ]
            return (
                "Isso impede você de trabalhar? Existe compromisso em risco hoje ou uma alternativa para continuar?",
                data,
            )
        priority = priority_for(
            facts["affected_scope"],
            facts.get("blocked", False),
            facts.get("same_day", False),
            facts.get("workaround", False),
        )
        payload = {
            "title": str(facts["title"])[:200],
            "description": str(facts.get("description") or content)[:6000],
            "kind": facts.get("kind") if facts.get("kind") in {"INC", "REQ"} else "INC",
            "category": facts["category"],
            "priority": priority,
            "affected_scope": facts["affected_scope"],
        }
    draft = service.prepare(conv, payload, selected if intent == "update" else None)
    data["draft"] = draft_json(draft)
    decision["actions"] += ["Classificou a prioridade", "Calculou o SLA", "Montou o rascunho"]
    decision["rules"] += ["IMPACT_URGENCY", "BUSINESS_CALENDAR", "CHECK_DUPLICATES"]
    return "Confira os dados abaixo. O chamado só será criado ou alterado depois da sua confirmação.", data


@router.post("/conversations/{conversation_id}/messages")
async def send(conversation_id: str, body: MessageBody, db: DB, user: Actor):
    content = body.content.strip()
    if not content:
        raise HTTPException(422, "Escreva uma mensagem.")
    conv = get_conversation(db, user, conversation_id, lock=True)
    existing = db.scalar(
        select(Message).where(Message.conversation_id == conv.id, Message.client_id == body.client_id)
    )
    if existing:
        return {"replayed": True}
    if conv.state == "CLOSED":
        raise HTTPException(409, "Atendimento encerrado. Inicie uma nova conversa.")
    if user.role == "ANALYST" and conv.user_id != user.id:
        raise HTTPException(403, "Use o endpoint de mensagens do analista.")
    if conv.state == "AGENT_ACTIVE":
        if conv.busy_until and aware(conv.busy_until) > now():
            raise HTTPException(409, "Já existe uma resposta em andamento nesta conversa.")
        if conv.turns >= 30:
            raise HTTPException(
                429, "Limite de 30 mensagens atingido. Inicie nova conversa ou chame um analista."
            )
        daily = db.scalar(
            select(func.count())
            .select_from(Message)
            .where(Message.role == "USER", Message.created_at > now() - timedelta(days=1))
        )
        if daily and daily >= 300:
            raise HTTPException(
                429, "Limite diário global da demonstração atingido. Atendimento humano continua disponível."
            )
        conv.turns += 1
        conv.epoch += 1
        conv.busy_until = now() + timedelta(seconds=60)
    service = TicketService(db, user)
    if body.ticket_id:
        selected = service.get(body.ticket_id)
        conv.selected_ticket_id = selected.id
    epoch = conv.epoch
    message = add_message(db, conv, "USER", user.name, content)
    message.client_id = body.client_id
    db.commit()
    if conv.state != "AGENT_ACTIVE":
        return {"message": message_json(message), "agent_paused": True}

    async def stream():
        started = time.monotonic()
        try:
            yield event("action", "Consultando seus chamados e a central de ajuda…")
            legacy_attempts = 0
            for attempt in range(3):
                legacy_attempts += 1
                try:
                    own_tickets = service.list()
                    break
                except HTTPException as error:
                    if error.status_code != 503 or attempt == 2:
                        raise
                    yield event("action", f"Sistema de chamados indisponível; tentativa {attempt + 2} de 3…")
                    await asyncio.sleep(0.2 * (2**attempt))
            articles = list(db.scalars(select(Article)))
            history = list(
                db.scalars(
                    select(Message)
                    .where(Message.conversation_id == conv.id)
                    .order_by(Message.created_at.desc())
                    .limit(12)
                )
            )
            payload = {
                "content": content,
                "facts": conv.facts,
                "messages": [
                    {"role": m.role, "content": m.content[:2000]}
                    for m in reversed(history)
                    if m.id != message.id
                ],
                "tickets": [
                    {
                        key: value
                        for key, value in ticket_json(t).items()
                        if key in {"id", "code", "title", "category", "priority", "status", "overdue"}
                    }
                    for t in own_tickets[:30]
                ],
                "articles": [
                    {"id": a.id, "title": a.title, "content": a.content, "applies_to": a.applies_to}
                    for a in articles
                ],
            }
            db.commit()  # No open transaction while awaiting the model.
            proposal = await request_proposal(payload)
            conv_live = get_conversation(db, user, conv.id, lock=True)
            if conv_live.state != "AGENT_ACTIVE" or conv_live.epoch != epoch:
                db.rollback()
                yield event("paused", "A conversa passou para atendimento humano.")
                return
            reply, data = apply_proposal(db, user, conv_live, proposal, service, own_tickets, content)
            data["decision"]["legacy_attempts"] = legacy_attempts
            data["decision"]["duration_ms"] = round((time.monotonic() - started) * 1000)
            response = add_message(db, conv_live, "AGENT", "Nexo Assist", reply, data)
            conv_live.busy_until = None
            db.commit()
            # Output is streamed only after validation and durable state transition.
            yield event("decision", data["decision"])
            for offset in range(0, len(reply), 70):
                db.refresh(conv_live)
                if conv_live.epoch != epoch:
                    break
                yield event("delta", reply[offset : offset + 70])
                await asyncio.sleep(0)
            yield event("done", message_json(response))
        except (httpx.HTTPError, ValueError, HTTPException) as error:
            db.rollback()
            current = get_conversation(db, user, conv.id, lock=True)
            if current.state == "AGENT_ACTIVE" and current.epoch == epoch:
                current.busy_until = None
                detail = (
                    error.detail
                    if isinstance(error, HTTPException)
                    else "Não consegui concluir a consulta com segurança. Tente novamente ou chame um analista."
                )
                failure = add_message(
                    db, current, "SYSTEM", "Service desk", str(detail), {"error": True, "retryable": True}
                )
                db.commit()
                yield event("error", message_json(failure))
        finally:
            db.rollback()

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})
