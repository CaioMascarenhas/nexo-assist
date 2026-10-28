from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from .config import settings
from .conversation_routes import add_message, get_conversation
from .models import Draft
from .schemas import EditDraftBody, RevisionBody
from .security import Actor, DB
from .serialization import draft_json
from .ticket_service import TicketService, ticket_json

router = APIRouter()


@router.get("/tickets")
def tickets(db: DB, user: Actor):
    return [ticket_json(t) for t in TicketService(db, user).list()]


@router.get("/tickets/{ticket_id}")
def ticket(ticket_id: str, db: DB, user: Actor):
    return ticket_json(TicketService(db, user).get(ticket_id))


def owned_draft(db, user, draft_id):
    draft = db.scalar(
        select(Draft)
        .where(Draft.id == draft_id, Draft.user_id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if draft is None:
        raise HTTPException(404, "Rascunho não encontrado.")
    return draft


@router.post("/drafts/{draft_id}/confirm")
def confirm(draft_id: str, body: RevisionBody, db: DB, user: Actor):
    # Serialize all writes for one owner to prevent concurrent duplicate creations.
    from .models import User

    db.scalar(select(User).where(User.id == user.id).with_for_update())
    reference = db.scalar(select(Draft).where(Draft.id == draft_id, Draft.user_id == user.id))
    if reference is None:
        raise HTTPException(404, "Rascunho não encontrado.")
    # Match chat's lock order: conversation before draft, avoiding a deadlock.
    conv = get_conversation(db, user, reference.conversation_id, lock=True)
    draft = owned_draft(db, user, draft_id)
    already_done = draft.status == "COMMITTED"
    if not already_done and conv.state != "AGENT_ACTIVE":
        raise HTTPException(409, "O atendimento mudou. Confirme com o suporte antes de alterar o chamado.")
    result = TicketService(db, user).confirm(draft, body.revision)
    conv.selected_ticket_id = result.id
    if not already_done:
        add_message(
            db,
            conv,
            "SYSTEM",
            "Service desk",
            f"Chamado {result.code}: operação confirmada e concluída.",
            {"tickets": [ticket_json(result)], "operation": draft.operation},
        )
    db.commit()
    if not already_done and settings.ticket_failure_mode == "after_commit":
        raise HTTPException(
            503,
            "Resposta do legado interrompida após envio. Repita a confirmação para consultar o resultado.",
        )
    return {"ticket": ticket_json(result), "draft": draft_json(draft)}


@router.patch("/drafts/{draft_id}")
def edit(draft_id: str, body: EditDraftBody, db: DB, user: Actor):
    draft = owned_draft(db, user, draft_id)
    if draft.status != "PENDING" or draft.revision != body.revision:
        raise HTTPException(409, "Rascunho não está mais disponível nesta versão.")
    draft.payload = {**draft.payload, "title": body.title.strip(), "description": body.description.strip()}
    draft.revision += 1
    db.commit()
    return draft_json(draft)


@router.post("/drafts/{draft_id}/cancel")
def cancel(draft_id: str, body: RevisionBody, db: DB, user: Actor):
    draft = owned_draft(db, user, draft_id)
    if draft.status != "PENDING" or draft.revision != body.revision:
        raise HTTPException(409, "Rascunho não está mais pendente nesta versão.")
    draft.status = "CANCELLED"
    db.commit()
    return draft_json(draft)
