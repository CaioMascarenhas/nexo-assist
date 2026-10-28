from datetime import timedelta

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .domain import aware
from .models import Conversation, Draft, Message, User, now
from .security import Actor, DB
from .serialization import conversation_json, draft_json, message_json, user_json

router = APIRouter()


def get_conversation(db: Session, user: User, conversation_id: str, lock: bool = False) -> Conversation:
    query = select(Conversation).where(Conversation.id == conversation_id)
    if user.role != "ANALYST":
        query = query.where(Conversation.user_id == user.id)
    if lock:
        query = query.with_for_update()
    conversation = db.scalar(query.execution_options(populate_existing=True))
    if conversation is None:
        raise HTTPException(404, "Conversa não encontrada.")
    return conversation


def add_message(db: Session, conv: Conversation, role: str, author: str, content: str, data=None) -> Message:
    msg = Message(conversation_id=conv.id, role=role, author=author, content=content, data=data or {})
    db.add(msg)
    conv.updated_at = now()
    db.flush()
    return msg


def pause(db: Session, conv: Conversation, reason: str, summary: str) -> None:
    conv.state = "WAITING_ANALYST"
    conv.analyst_id = None
    conv.epoch += 1
    conv.busy_until = None
    conv.handoff_reason = reason
    conv.summary = summary
    add_message(
        db, conv, "SYSTEM", "Service desk", "Conversa transferida. Agent pausado até devolução pelo suporte."
    )


@router.get("/conversations")
def list_conversations(db: DB, user: Actor):
    query = (
        select(Conversation).where(Conversation.user_id == user.id).order_by(Conversation.updated_at.desc())
    )
    return [conversation_json(c) for c in db.scalars(query)]


@router.post("/conversations")
def create_conversation(db: DB, user: Actor):
    recent = list(
        db.scalars(
            select(Conversation).where(
                Conversation.user_id == user.id, Conversation.created_at > now() - timedelta(days=1)
            )
        )
    )
    if len(recent) >= 10:
        raise HTTPException(429, "Limite diário de conversas atingido. Retome uma conversa existente.")
    conv = Conversation(user_id=user.id)
    db.add(conv)
    db.flush()
    add_message(
        db,
        conv,
        "AGENT",
        "Nexo Assist",
        f"Olá, {user.name.split()[0]}. Como posso ajudar com TI hoje?",
        {"quickReplies": ["Consultar meus chamados", "Preciso de ajuda com a VPN", "Falar com um analista"]},
    )
    db.commit()
    return conversation_json(conv)


@router.get("/conversations/{conversation_id}")
def get_history(conversation_id: str, db: DB, user: Actor):
    conv = get_conversation(db, user, conversation_id)
    messages = db.scalars(
        select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at, Message.id)
    )
    drafts = db.scalars(select(Draft).where(Draft.conversation_id == conv.id).order_by(Draft.expires_at))
    owner = db.get(User, conv.user_id)
    return {
        **conversation_json(conv),
        "user": user_json(owner),
        "messages": [message_json(m) for m in messages],
        "drafts": [draft_json(d) for d in drafts],
        "interrupted": bool(conv.busy_until and aware(conv.busy_until) < now()),
    }


@router.post("/conversations/{conversation_id}/handoff")
def handoff(conversation_id: str, db: DB, user: Actor):
    conv = get_conversation(db, user, conversation_id, lock=True)
    if conv.state == "CLOSED":
        raise HTTPException(409, "Atendimento encerrado.")
    if conv.state == "AGENT_ACTIVE":
        history = db.scalars(
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.created_at.desc())
            .limit(8)
        )
        summary = "\n".join(f"{m.author}: {m.content[:600]}" for m in reversed(list(history)))
        pause(db, conv, "USER_REQUEST", summary)
        if conv.selected_ticket_id:
            from .ticket_service import TicketService

            try:
                TicketService(db, user).transfer(conv.selected_ticket_id, "USER_REQUEST")
            except HTTPException as error:
                if error.status_code != 503:
                    raise
                add_message(
                    db,
                    conv,
                    "SYSTEM",
                    "Service desk",
                    "Conversa na fila humana; atualização do chamado indisponível no momento.",
                )
        db.commit()
    return conversation_json(conv)
