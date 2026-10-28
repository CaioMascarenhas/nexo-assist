from fastapi import FastAPI
from sqlalchemy import text

from .database import SessionLocal

app = FastAPI(title="Nexo Assist", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ok"}
