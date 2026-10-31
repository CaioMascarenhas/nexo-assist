from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from .conversation_routes import add_message, get_conversation
from .domain import due_at
from .models import Conversation, Message, User, now
from .schemas import MessageBody, ResolveTicketBody, TransferAnalystBody, TransitionBody
from .security import Actor, DB, require_analyst
from .serialization import conversation_json, message_json, user_json
from .ticket_service import TicketService, ticket_json

router = APIRouter(prefix="/analyst")


@router.get("/colleagues")
def colleagues(db: DB, user: Actor):
    require_analyst(user)
    return [
        {"id": analyst.id, "name": analyst.name, "department": analyst.department}
        for analyst in db.scalars(
            select(User).where(User.role == "ANALYST", User.id != user.id).order_by(User.name)
        )
    ]


@router.get("/conversations")
def conversations(db: DB, user: Actor, filter: str = "all", q: str = ""):
    require_analyst(user)
    query = select(Conversation).order_by(Conversation.updated_at.desc()).limit(100)
    if filter == "waiting":
        query = query.where(Conversation.state == "WAITING_ANALYST")
    elif filter == "agent":
        query = query.where(Conversation.state == "AGENT_ACTIVE")
    elif filter == "mine":
        query = query.where(Conversation.analyst_id == user.id, Conversation.state == "HUMAN_ACTIVE")
    result = []
    for conv in db.scalars(query):
        owner = db.get(User, conv.user_id)
        last = db.scalar(
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        searchable = " ".join(
            [owner.name, owner.email, conv.selected_ticket_id or "", last.content if last else ""]
        )
        if q and conv.selected_ticket_id:
            try:
                related = TicketService(db, user).get(conv.selected_ticket_id)
                searchable += " " + related.code + " " + related.title
            except HTTPException as error:
                if error.status_code != 503:
                    raise
        if q.lower() not in searchable.lower():
            continue
        result.append(
            {
                **conversation_json(conv),
                "user": user_json(owner),
                "last_message": last.content if last else "Nova conversa",
            }
        )
    return result


@router.get("/conversations/{conversation_id}/tickets")
def tickets(conversation_id: str, db: DB, user: Actor):
    require_analyst(user)
    conv = get_conversation(db, user, conversation_id)
    return [ticket_json(t) for t in TicketService(db, user).list(conv.user_id)]


@router.post("/conversations/{conversation_id}/claim")
def claim(conversation_id: str, body: TransitionBody, db: DB, user: Actor):
    require_analyst(user)
    conv = get_conversation(db, user, conversation_id, lock=True)
    if conv.state != "WAITING_ANALYST" or conv.analyst_id or conv.epoch != body.epoch:
        raise HTTPException(409, "Este atendimento mudou ou já foi assumido por outra pessoa.")
    conv.state, conv.analyst_id = "HUMAN_ACTIVE", user.id
    conv.epoch += 1
    conv.busy_until = None
    add_message(db, conv, "SYSTEM", "Service desk", f"{user.name} assumiu o atendimento. Assistente pausado.")
    if conv.selected_ticket_id:
        try:
            ticket = TicketService(db, user).get(conv.selected_ticket_id, lock=True)
            if ticket.status not in {"RESOLVED", "CLOSED"}:
                ticket.status = "IN_PROGRESS"
                ticket.version += 1
        except HTTPException as error:
            if error.status_code != 503:
                raise
            add_message(
                db,
                conv,
                "SYSTEM",
                "Service desk",
                "Atendimento assumido; sistema de chamados indisponível temporariamente.",
            )
    db.commit()
    return conversation_json(conv)


@router.post("/conversations/{conversation_id}/messages")
def message(conversation_id: str, body: MessageBody, db: DB, user: Actor):
    require_analyst(user)
    conv = get_conversation(db, user, conversation_id, lock=True)
    if conv.state != "HUMAN_ACTIVE" or conv.analyst_id != user.id:
        raise HTTPException(409, "Assuma o atendimento para responder.")
    existing = db.scalar(
        select(Message).where(Message.conversation_id == conv.id, Message.client_id == body.client_id)
    )
    if existing:
        return message_json(existing)
    if not body.content.strip():
        raise HTTPException(422, "Escreva uma mensagem.")
    result = add_message(db, conv, "ANALYST", user.name, body.content.strip())
    result.client_id = body.client_id
    if conv.selected_ticket_id:
        try:
            ticket = TicketService(db, user).get(conv.selected_ticket_id, lock=True)
            ticket.support_updated_at = now()
            ticket.due_at = due_at(ticket.support_updated_at, ticket.priority)
            ticket.version += 1
            ticket.updates = [
                *ticket.updates,
                {"author": user.name, "content": body.content, "at": now().isoformat()},
            ]
        except HTTPException as error:
            if error.status_code != 503:
                raise
            add_message(
                db,
                conv,
                "SYSTEM",
                "Service desk",
                "Mensagem enviada; atualização do chamado pendente por indisponibilidade. O SLA não foi renovado.",
            )
    db.commit()
    return message_json(result)


@router.post("/conversations/{conversation_id}/resolve-ticket")
def resolve_ticket(conversation_id: str, body: ResolveTicketBody, db: DB, user: Actor):
    require_analyst(user)
    conv = get_conversation(db, user, conversation_id, lock=True)
    if conv.state != "HUMAN_ACTIVE" or conv.analyst_id != user.id or conv.epoch != body.epoch:
        raise HTTPException(409, "Assuma o atendimento atual para resolver o chamado.")
    if conv.selected_ticket_id != body.ticket_id:
        raise HTTPException(409, "O chamado não está vinculado a esta conversa.")
    ticket = TicketService(db, user).resolve(body.ticket_id, conv.user_id, body.version, body.resolution)
    conv.facts = {}
    add_message(
        db,
        conv,
        "SYSTEM",
        "Service desk",
        f"Chamado {ticket.code} resolvido por {user.name}. Solução: {body.resolution}",
        {"tickets": [ticket_json(ticket)], "operation": "RESOLVE"},
    )
    db.commit()
    return {"ticket": ticket_json(ticket), "conversation": conversation_json(conv)}


@router.post("/conversations/{conversation_id}/transfer")
def transfer_analyst(conversation_id: str, body: TransferAnalystBody, db: DB, user: Actor):
    require_analyst(user)
    conv = get_conversation(db, user, conversation_id, lock=True)
    if conv.state != "HUMAN_ACTIVE" or conv.analyst_id != user.id or conv.epoch != body.epoch:
        raise HTTPException(
            409, "Somente o responsável atual pode encaminhar este atendimento. Atualize a conversa."
        )
    target = db.get(User, body.target_analyst_id)
    if target is None or target.role != "ANALYST":
        raise HTTPException(422, "Selecione um analista válido para receber o atendimento.")
    if target.id == user.id:
        raise HTTPException(422, "Selecione outro analista para receber o atendimento.")
    sync_pending = False
    if conv.selected_ticket_id:
        try:
            TicketService(db, user).record_analyst_transfer(
                conv.selected_ticket_id, conv.user_id, target, body.reason
            )
        except HTTPException as error:
            if error.status_code != 503:
                raise
            sync_pending = True
    conv.analyst_id = target.id
    conv.epoch += 1
    conv.busy_until = None
    conv.handoff_reason = "ANALYST_TRANSFER"
    handoff = (
        f"{user.name} encaminhou o atendimento para {target.name} ({target.department}). "
        f"Motivo: {body.reason}"
    )
    conv.summary = "\n\n".join(part for part in (conv.summary, handoff) if part)
    add_message(
        db,
        conv,
        "SYSTEM",
        "Service desk",
        handoff + " O assistente continua pausado.",
        {
            "operation": "ANALYST_TRANSFER",
            "from_analyst_id": user.id,
            "to_analyst_id": target.id,
            "reason": body.reason,
            "ticket_sync_pending": sync_pending,
        },
    )
    if sync_pending:
        add_message(
            db,
            conv,
            "SYSTEM",
            "Service desk",
            "Encaminhamento concluído entre os analistas; o registro no chamado está indisponível no momento. O prazo de resposta foi preservado.",
        )
    db.commit()
    return conversation_json(conv)


@router.post("/conversations/{conversation_id}/{action}")
def transition(conversation_id: str, action: str, body: TransitionBody, db: DB, user: Actor):
    require_analyst(user)
    if action not in {"release", "close"}:
        raise HTTPException(404, "Ação não encontrada.")
    conv = get_conversation(db, user, conversation_id, lock=True)
    allowed = (
        conv.analyst_id == user.id
        if conv.state == "HUMAN_ACTIVE"
        else conv.state == "WAITING_ANALYST" and action == "release"
    )
    if not allowed or conv.epoch != body.epoch:
        raise HTTPException(409, "Atendimento indisponível para esta ação.")
    if action == "close" and conv.selected_ticket_id:
        ticket = TicketService(db, user).get(conv.selected_ticket_id, lock=True)
        if ticket.status not in {"RESOLVED", "CLOSED"}:
            raise HTTPException(
                409,
                f"O chamado {ticket.code} ainda está aberto. Resolva o chamado antes de encerrar. "
                "O atendimento continua sob sua responsabilidade em Minhas.",
            )
    conv.state = "AGENT_ACTIVE" if action == "release" else "CLOSED"
    conv.analyst_id = None
    conv.busy_until = None
    conv.epoch += 1
    if action == "release":
        history = db.scalars(
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.created_at.desc())
            .limit(8)
        )
        conv.summary = "\n".join(f"{m.author}: {m.content[:500]}" for m in reversed(list(history)))
    add_message(
        db,
        conv,
        "SYSTEM",
        "Service desk",
        f"{user.name} "
        + (
            "devolveu a conversa ao assistente."
            if action == "release"
            else "encerrou o atendimento. O status do chamado foi preservado."
        ),
    )
    db.commit()
    return conversation_json(conv)
