from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from nexo.config import settings


def test_frozen_migration_upgrades_and_downgrades_an_empty_schema(database, monkeypatch):
    schema = "migration_" + uuid4().hex
    engine = database.bind
    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    url = engine.url.update_query_dict({"options": f"-csearch_path={schema}"})
    monkeypatch.setattr(settings, "database_url", url.render_as_string(hide_password=False))
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "migrations"))
    try:
        command.upgrade(config, "head")
        assert {"users", "tickets", "drafts", "messages", "conversations", "sessions", "articles"} <= set(
            inspect(engine).get_table_names(schema=schema)
        )
        command.downgrade(config, "base")
        assert "users" not in inspect(engine).get_table_names(schema=schema)
    finally:
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
