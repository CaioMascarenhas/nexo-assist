"""PostgreSQL integration tests use a fresh schema, never truncate user data."""

import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from nexo.database import Base, get_db
from nexo.main import app
from nexo.models import User


@pytest.fixture
def database():
    url = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+psycopg://nexo:nexo-local-only@127.0.0.1:5432/nexo?connect_timeout=10",
    )
    schema = "test_" + uuid4().hex
    admin = create_engine(url)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        db.add_all(
            [
                User(id="alice", name="Alice", email="alice@nexo.com.br", role="EMPLOYEE"),
                User(id="bob", name="Bob", email="bob@nexo.com.br", role="EMPLOYEE"),
                User(id="support", name="Support", email="support@nexo.com.br", role="ANALYST"),
                User(id="support2", name="Support 2", email="support2@nexo.com.br", role="ANALYST"),
            ]
        )
        db.commit()
        yield db
    engine.dispose()
    with admin.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    admin.dispose()


@pytest.fixture
def client(database):
    def override():
        try:
            yield database
        finally:
            database.rollback()

    app.dependency_overrides[get_db] = override
    with TestClient(app) as instance:
        yield instance
    app.dependency_overrides.clear()


def login(client, name="alice"):
    response = client.post(
        "/auth/login", json={"email": f"{name}@nexo.com.br", "password": "any-demo-password"}
    )
    assert response.status_code == 200, response.text
