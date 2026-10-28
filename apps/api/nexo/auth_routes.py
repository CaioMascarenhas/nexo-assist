from fastapi import APIRouter, Request, Response
from fastapi.exceptions import HTTPException
from sqlalchemy import select

from .config import settings
from .models import LoginSession, User
from .schemas import LoginBody
from .security import Actor, DB, create_session, token_hash
from .serialization import user_json

router = APIRouter()


@router.post("/auth/login")
def login(body: LoginBody, response: Response, db: DB):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user is None:
        raise HTTPException(401, "E-mail não cadastrado na demonstração.")
    token = create_session(db, user, body.remember)
    response.set_cookie(
        "nexo_session",
        token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=604800 if body.remember else 86400,
    )
    return user_json(user)


@router.post("/auth/logout")
def logout(request: Request, response: Response, db: DB):
    session = db.get(LoginSession, token_hash(request.cookies.get("nexo_session", "")))
    if session:
        db.delete(session)
        db.commit()
    response.delete_cookie("nexo_session")
    return {"ok": True}


@router.get("/me")
def me(user: Actor):
    return user_json(user)
