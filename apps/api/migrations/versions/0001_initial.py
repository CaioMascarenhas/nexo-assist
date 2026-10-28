"""Initial schema frozen at revision 0001; independent of future model changes."""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

STATEMENTS = [
    "CREATE TABLE articles (\n\tid VARCHAR(50) NOT NULL, \n\ttitle VARCHAR(200) NOT NULL, \n\tcontent TEXT NOT NULL, \n\ttags VARCHAR(200) NOT NULL, \n\tapplies_to VARCHAR(80) NOT NULL, \n\tPRIMARY KEY (id)\n)",
    "CREATE TABLE users (\n\tid VARCHAR(36) NOT NULL, \n\tname VARCHAR(120) NOT NULL, \n\temail VARCHAR(200) NOT NULL, \n\trole VARCHAR(20) NOT NULL, \n\tdepartment VARCHAR(80) NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (email)\n)",
    "CREATE TABLE conversations (\n\tid VARCHAR(36) NOT NULL, \n\tuser_id VARCHAR(36) NOT NULL, \n\tstate VARCHAR(30) NOT NULL, \n\tanalyst_id VARCHAR(36), \n\tturns INTEGER NOT NULL, \n\tepoch INTEGER NOT NULL, \n\tbusy_until TIMESTAMP WITH TIME ZONE, \n\tfacts JSON NOT NULL, \n\tselected_ticket_id VARCHAR(36), \n\tsummary TEXT NOT NULL, \n\thandoff_reason VARCHAR(40), \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tCHECK (turns >= 0 AND turns <= 30), \n\tCHECK (state IN ('AGENT_ACTIVE','WAITING_ANALYST','HUMAN_ACTIVE','CLOSED')), \n\tFOREIGN KEY(user_id) REFERENCES users (id), \n\tFOREIGN KEY(analyst_id) REFERENCES users (id)\n)",
    "CREATE INDEX ix_conversations_state ON conversations (state)",
    "CREATE INDEX ix_conversations_updated_at ON conversations (updated_at)",
    "CREATE INDEX ix_conversations_user_id ON conversations (user_id)",
    "CREATE TABLE sessions (\n\ttoken_hash VARCHAR(64) NOT NULL, \n\tuser_id VARCHAR(36) NOT NULL, \n\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (token_hash), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)",
    "CREATE TABLE tickets (\n\tid VARCHAR(36) NOT NULL, \n\tcode VARCHAR(30) NOT NULL, \n\tuser_id VARCHAR(36) NOT NULL, \n\ttitle VARCHAR(200) NOT NULL, \n\tdescription TEXT NOT NULL, \n\tkind VARCHAR(3) NOT NULL, \n\tcategory VARCHAR(40) NOT NULL, \n\tpriority VARCHAR(10) NOT NULL, \n\taffected_scope VARCHAR(20) NOT NULL, \n\tstatus VARCHAR(30) NOT NULL, \n\tversion INTEGER NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tsupport_updated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tdue_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tresolved_at TIMESTAMP WITH TIME ZONE, \n\tupdates JSON NOT NULL, \n\tPRIMARY KEY (id), \n\tCHECK (kind IN ('INC','REQ')), \n\tCHECK (priority IN ('CRITICAL','HIGH','MEDIUM','LOW')), \n\tUNIQUE (code), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)",
    "CREATE INDEX ix_tickets_user_id ON tickets (user_id)",
    "CREATE TABLE drafts (\n\tid VARCHAR(36) NOT NULL, \n\tconversation_id VARCHAR(36) NOT NULL, \n\tuser_id VARCHAR(36) NOT NULL, \n\toperation VARCHAR(12) NOT NULL, \n\ttarget_id VARCHAR(36), \n\ttarget_version INTEGER, \n\tpayload JSON NOT NULL, \n\trevision INTEGER NOT NULL, \n\tstatus VARCHAR(20) NOT NULL, \n\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tresult_ticket_id VARCHAR(36), \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(conversation_id) REFERENCES conversations (id), \n\tFOREIGN KEY(user_id) REFERENCES users (id), \n\tFOREIGN KEY(target_id) REFERENCES tickets (id), \n\tFOREIGN KEY(result_ticket_id) REFERENCES tickets (id)\n)",
    "CREATE INDEX ix_drafts_conversation_id ON drafts (conversation_id)",
    "CREATE TABLE messages (\n\tid VARCHAR(36) NOT NULL, \n\tconversation_id VARCHAR(36) NOT NULL, \n\tclient_id VARCHAR(80), \n\trole VARCHAR(20) NOT NULL, \n\tauthor VARCHAR(120) NOT NULL, \n\tcontent TEXT NOT NULL, \n\tdata JSON NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (conversation_id, client_id), \n\tFOREIGN KEY(conversation_id) REFERENCES conversations (id)\n)",
    "CREATE INDEX ix_messages_conversation_id ON messages (conversation_id)",
]


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(sa.text(statement))


def downgrade() -> None:
    op.drop_table("messages")
    op.drop_table("drafts")
    op.drop_table("tickets")
    op.drop_table("sessions")
    op.drop_table("conversations")
    op.drop_table("users")
    op.drop_table("articles")
