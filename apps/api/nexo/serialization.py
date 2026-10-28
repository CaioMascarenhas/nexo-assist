from typing import Any
from sqlalchemy.orm import object_session

from .domain import aware
from .models import Conversation, Draft, Message, Ticket, User, now


def user_json(user: User) -> dict[str, str]:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "department": user.department,
    }


def message_json(message: Message) -> dict[str, Any]:
    return {
        "id": message.id,
        "role": message.role,
        "author": message.author,
        "content": message.content,
        "data": message.data,
        "created_at": message.created_at.isoformat(),
    }


def conversation_json(conv: Conversation) -> dict[str, Any]:
    return {
        "id": conv.id,
        "user_id": conv.user_id,
        "state": conv.state,
        "analyst_id": conv.analyst_id,
        "turns": conv.turns,
        "epoch": conv.epoch,
        "summary": conv.summary,
        "handoff_reason": conv.handoff_reason,
        "selected_ticket_id": conv.selected_ticket_id,
        "updated_at": conv.updated_at.isoformat(),
    }


def draft_json(draft: Draft) -> dict[str, Any]:
    session = object_session(draft)
    target = session.get(Ticket, draft.target_id) if session and draft.target_id else None
    return {
        "id": draft.id,
        "operation": draft.operation,
        "target_id": draft.target_id,
        "target_code": target.code if target and target.user_id == draft.user_id else None,
        "payload": draft.payload,
        "revision": draft.revision,
        "status": draft.status,
        "expires_at": draft.expires_at.isoformat(),
        "expired": draft.status == "PENDING" and aware(draft.expires_at) <= now(),
        "result_ticket_id": draft.result_ticket_id,
    }
