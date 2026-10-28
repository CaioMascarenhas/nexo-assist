from datetime import timedelta
from difflib import SequenceMatcher
from typing import Any
from uuid import uuid4
from threading import Lock

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .domain import CATEGORIES, aware, can_reopen, due_at, overdue
from .models import Conversation, Draft, Ticket, User, now

_fault_lock = Lock()
_transient_faults = 2


class TicketService:
    """Simulated legacy boundary. The agent never imports its repository/models."""

    def __init__(self, db: Session, actor: User):
        self.db, self.actor = db, actor

    def available(self) -> None:
        global _transient_faults
        if settings.ticket_failure_mode == "always":
            raise HTTPException(503, "Sistema de chamados temporariamente indisponível. Tente novamente.")
        if settings.ticket_failure_mode == "transient":
            with _fault_lock:
                if _transient_faults > 0:
                    _transient_faults -= 1
                    raise HTTPException(503, "Falha transitória simulada do legado.")

    def list(self, owner_id: str | None = None) -> list[Ticket]:
        self.available()
        owner = owner_id if self.actor.role == "ANALYST" and owner_id else self.actor.id
        return list(
            self.db.scalars(select(Ticket).where(Ticket.user_id == owner).order_by(Ticket.created_at.desc()))
        )

    def get(self, ticket_id: str, lock: bool = False) -> Ticket:
        self.available()
        query = select(Ticket).where(Ticket.id == ticket_id)
        if self.actor.role != "ANALYST":
            query = query.where(Ticket.user_id == self.actor.id)
        if lock:
            query = query.with_for_update()
        ticket = self.db.scalar(query.execution_options(populate_existing=True))
        if ticket is None:
            raise HTTPException(404, "Chamado não encontrado.")
        return ticket

    def related(self, title: str, category: str) -> Ticket | None:
        # Category alone is insufficient; require a strong title match.
        for ticket in self.list():
            score = SequenceMatcher(None, title.lower(), ticket.title.lower()).ratio()
            if ticket.category == category and score >= 0.65:
                if ticket.status not in {"RESOLVED", "CLOSED"} or can_reopen(ticket.resolved_at, now()):
                    return ticket
        return None

    def prepare(self, conv: Conversation, payload: dict[str, Any], target: Ticket | None = None) -> Draft:
        self.available()
        if payload.get("category") not in CATEGORIES:
            raise HTTPException(422, "Categoria inválida.")
        for old in self.db.scalars(
            select(Draft).where(Draft.conversation_id == conv.id, Draft.status == "PENDING")
        ):
            old.status = "INVALIDATED"
        if target is None:
            target = self.related(payload["title"], payload["category"])
        elif target.status in {"RESOLVED", "CLOSED"} and not can_reopen(target.resolved_at, now()):
            target = self.related(payload["title"], payload["category"])
        operation = "CREATE"
        if target:
            operation = "REOPEN" if target.status in {"RESOLVED", "CLOSED"} else "UPDATE"
        preview_due = due_at(now(), payload["priority"])
        if target and operation == "UPDATE":
            priorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
            effective = min([target.priority, payload["priority"]], key=priorities.index)
            preview_due = (
                target.due_at
                if effective == target.priority
                else due_at(target.support_updated_at, effective)
            )
            payload = {**payload, "priority": effective}
        payload = {**payload, "due_at": preview_due.isoformat()}
        draft = Draft(
            conversation_id=conv.id,
            user_id=conv.user_id,
            operation=operation,
            target_id=target.id if target else None,
            target_version=target.version if target else None,
            payload=payload,
            expires_at=now() + timedelta(hours=1),
        )
        self.db.add(draft)
        self.db.flush()
        return draft

    def transfer(self, ticket_id: str, reason: str) -> Ticket:
        ticket = self.get(ticket_id, lock=True)
        if ticket.status not in {"RESOLVED", "CLOSED"}:
            ticket.status = "WAITING_ANALYST"
            ticket.version += 1
            ticket.updates = [
                *ticket.updates,
                {"type": "transfer", "reason": reason, "at": now().isoformat()},
            ]
        return ticket

    def confirm(self, draft: Draft, revision: int) -> Ticket:
        self.available()
        if draft.user_id != self.actor.id:
            raise HTTPException(404, "Rascunho não encontrado.")
        if draft.revision != revision:
            raise HTTPException(409, "O rascunho mudou. Confira a versão atual antes de confirmar.")
        if draft.status == "COMMITTED":
            return self.get(draft.result_ticket_id)
        if draft.status != "PENDING" or aware(draft.expires_at) <= now():
            raise HTTPException(409, "Rascunho cancelado, expirado ou já substituído.")
        p = draft.payload
        if draft.target_id:
            ticket = self.get(draft.target_id, lock=True)
            if ticket.version != draft.target_version:
                raise HTTPException(409, "O chamado mudou. Gere um novo rascunho antes de confirmar.")
            if draft.operation == "REOPEN":
                if not can_reopen(ticket.resolved_at, now()):
                    raise HTTPException(409, "A janela de reabertura terminou.")
                ticket.status, ticket.resolved_at = "OPEN", None
                ticket.priority = p["priority"]
                ticket.due_at = due_at(now(), p["priority"])
            elif ["CRITICAL", "HIGH", "MEDIUM", "LOW"].index(p["priority"]) < [
                "CRITICAL",
                "HIGH",
                "MEDIUM",
                "LOW",
            ].index(ticket.priority):
                ticket.priority = p["priority"]
                ticket.due_at = due_at(ticket.support_updated_at, ticket.priority)
            ticket.description += "\n\nComplemento confirmado: " + p["description"]
            ticket.updates = [
                *ticket.updates,
                {"author": self.actor.name, "content": p["description"], "at": now().isoformat()},
            ]
            ticket.version += 1
            # A user's complement must not clear a previously overdue support SLA.
        else:
            if self.related(p["title"], p["category"]):
                raise HTTPException(
                    409, "Encontramos um chamado equivalente. Gere um rascunho de atualização."
                )
            code = p["kind"] + "-" + uuid4().hex[:8].upper()
            ticket = Ticket(
                code=code,
                user_id=draft.user_id,
                title=p["title"],
                description=p["description"],
                kind=p["kind"],
                category=p["category"],
                priority=p["priority"],
                affected_scope=p["affected_scope"],
                due_at=due_at(now(), p["priority"]),
            )
            self.db.add(ticket)
            self.db.flush()
        draft.status, draft.result_ticket_id = "COMMITTED", ticket.id
        return ticket


def ticket_json(t: Ticket) -> dict[str, Any]:
    return {
        "id": t.id,
        "code": t.code,
        "title": t.title,
        "description": t.description,
        "kind": t.kind,
        "category": t.category,
        "priority": t.priority,
        "status": t.status,
        "affected_scope": t.affected_scope,
        "version": t.version,
        "created_at": t.created_at.isoformat(),
        "support_updated_at": t.support_updated_at.isoformat(),
        "due_at": t.due_at.isoformat(),
        "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
        "overdue": overdue(t.status, t.due_at, now()),
        "updates": t.updates,
    }
