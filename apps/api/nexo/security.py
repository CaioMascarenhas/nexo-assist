import hashlib
import secrets
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db
from .domain import aware
from .models import LoginSession, User, now

DB = Annotated[Session, Depends(get_db)]


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user(request: Request, db: DB) -> User:
    session = db.get(LoginSession, token_hash(request.cookies.get("nexo_session", "")))
    if session is None or aware(session.expires_at) <= now():
        raise HTTPException(401, "Sua sessão expirou. Entre novamente.")
    user = db.get(User, session.user_id)
    if user is None:
        raise HTTPException(401, "Sessão inválida.")
    return user


Actor = Annotated[User, Depends(current_user)]


def require_analyst(user: User) -> None:
    if user.role != "ANALYST":
        raise HTTPException(403, "Acesso exclusivo do suporte.")


def create_session(db: Session, user: User, remember: bool) -> str:
    raw = secrets.token_urlsafe(40)
    db.add(LoginSession(token_hash=token_hash(raw), user_id=user.id,
                        expires_at=now()+timedelta(days=7 if remember else 1)))
    db.commit()
    return raw
