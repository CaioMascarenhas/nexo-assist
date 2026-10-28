from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .database import SessionLocal
from .config import settings
from .auth_routes import router as auth_router
from .conversation_routes import router as conversation_router
from .chat_routes import router as chat_router
from .ticket_routes import router as ticket_router
from .analyst_routes import router as analyst_router

app = FastAPI(title="Nexo Assist", version="0.1.0")
app.include_router(auth_router)
app.include_router(conversation_router)
app.include_router(chat_router)
app.include_router(ticket_router)
app.include_router(analyst_router)


@app.middleware("http")
async def secure_requests(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and origin:
        if origin not in settings.allowed_origins.split(","):
            return JSONResponse({"detail": "Origem não autorizada."}, status_code=403)
    correlation_id = str(uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = correlation_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
def health() -> dict[str, str]:
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ok"}
