from typing import Any

from .models import Conversation, Draft, Message, User


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
    return {
        "id": draft.id,
        "operation": draft.operation,
        "target_id": draft.target_id,
        "payload": draft.payload,
        "revision": draft.revision,
        "status": draft.status,
        "expires_at": draft.expires_at.isoformat(),
        "result_ticket_id": draft.result_ticket_id,
    }
