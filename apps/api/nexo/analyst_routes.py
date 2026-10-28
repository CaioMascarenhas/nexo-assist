from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from .conversation_routes import add_message, get_conversation
from .domain import due_at
from .models import Conversation, Message, User, now
from .schemas import MessageBody, TransitionBody
from .security import Actor, DB, require_analyst
from .serialization import conversation_json, message_json, user_json
from .ticket_service import TicketService, ticket_json

router = APIRouter(prefix="/analyst")


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
