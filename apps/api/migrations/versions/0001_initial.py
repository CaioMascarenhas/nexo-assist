"""Initial persistent support domain.

Revision ID: 0001
"""
from alembic import op
from nexo.database import Base
from nexo import models  # noqa: F401

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(op.get_bind())
