from datetime import datetime, timedelta
from difflib import SequenceMatcher
import re
import unicodedata
from typing import Any
from uuid import uuid4
from threading import Lock

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .domain import CATEGORIES, assessed_priority, aware, can_reopen, due_at, overdue
from .models import Conversation, Draft, Ticket, User, now

_fault_lock = Lock()
_transient_faults = 2


def sla_anchor(ticket: Ticket) -> datetime:
    # Reabertura inicia outra primeira resposta sem fingir mensagem do suporte.
    starts = [aware(ticket.support_updated_at)]
    starts.extend(
        aware(datetime.fromisoformat(update["at"]))
        for update in ticket.updates
        if update.get("type") == "reopen"
    )
    return max(starts)


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
        def normalized(value: str) -> str:
            return "".join(
                c for c in unicodedata.normalize("NFD", value.casefold()) if not unicodedata.combining(c)
            )

        def words(value: str) -> set[str]:
            stopwords = {
                "quero",
                "preciso",
                "solicitar",
                "solicito",
                "uma",
                "para",
                "com",
                "sem",
                "urgencia",
                "somente",
                "software",
                "programa",
            }
            return {
                word
                for word in re.findall(r"[a-z0-9]+", normalized(value))
                if len(word) >= 3 and word not in stopwords
            }

        # Categoria sozinha e uma palavra genérica nunca identificam o mesmo problema.
        candidates = []
        requested_words = words(title)
        for ticket in self.list():
            if ticket.category != category:
                continue
            opened = ticket.status not in {"RESOLVED", "CLOSED"}
            if not opened and not can_reopen(ticket.resolved_at, now()):
                continue
            score = SequenceMatcher(None, normalized(title), normalized(ticket.title)).ratio()
            existing_words = words(ticket.title)
            overlap = len(requested_words & existing_words)
            containment = overlap / max(1, min(len(requested_words), len(existing_words)))
            if score >= 0.65 or (overlap >= 2 and containment >= 0.8):
                candidates.append((opened, max(score, containment if overlap >= 2 else 0), ticket))
        return max(candidates, key=lambda candidate: candidate[:2])[2] if candidates else None

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
            review = payload.get("priority_review", {})
            assessed = assessed_priority(payload["affected_scope"], review.get("facts", {}))
            effective = assessed or min([target.priority, payload["priority"]], key=priorities.index)
            preview_due = (
                target.due_at if effective == target.priority else due_at(sla_anchor(target), effective)
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

    def resolve(self, ticket_id: str, owner_id: str, version: int, resolution: str) -> Ticket:
        if self.actor.role != "ANALYST":
            raise HTTPException(403, "Acesso exclusivo do suporte.")
        ticket = self.get(ticket_id, lock=True)
        if ticket.user_id != owner_id:
            raise HTTPException(404, "Chamado não encontrado neste atendimento.")
        if ticket.version != version:
            raise HTTPException(409, "O chamado mudou. Atualize os dados antes de resolver.")
        if ticket.status in {"RESOLVED", "CLOSED"}:
            raise HTTPException(409, "Este chamado já está resolvido ou encerrado.")
        instant = now()
        ticket.status = "RESOLVED"
        ticket.resolved_at = instant
        ticket.support_updated_at = instant
        ticket.version += 1
        ticket.updates = [
            *ticket.updates,
            {
                "type": "resolution",
                "author": self.actor.name,
                "content": resolution,
                "at": instant.isoformat(),
            },
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
                cycle_start = now()
                ticket.due_at = due_at(cycle_start, p["priority"])
                ticket.updates = [
                    *ticket.updates,
                    {"type": "reopen", "at": cycle_start.isoformat(), "author": self.actor.name},
                ]
            else:
                reviewed = assessed_priority(
                    p["affected_scope"], p.get("priority_review", {}).get("facts", {})
                )
                priorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
                effective = reviewed or min([ticket.priority, p["priority"]], key=priorities.index)
                if effective != ticket.priority:
                    ticket.priority = effective
                    ticket.due_at = due_at(sla_anchor(ticket), ticket.priority)
            ticket.description += "\n\nComplemento confirmado: " + p["description"]
            ticket.affected_scope = p["affected_scope"]
            ticket.updates = [
                *ticket.updates,
                {
                    "author": self.actor.name,
                    "content": p["description"],
                    "at": now().isoformat(),
                    "priority_review": p.get("priority_review"),
                    "summary": p.get("update_summary", ""),
                },
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
