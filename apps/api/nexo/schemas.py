from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LoginBody(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)
    remember: bool = False


class MessageBody(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    client_id: str = Field(min_length=1, max_length=80)
    ticket_id: str | None = Field(default=None, max_length=36)


class RevisionBody(BaseModel):
    revision: int = Field(ge=1)


class EditDraftBody(RevisionBody):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=5, max_length=6000)


class TransitionBody(BaseModel):
    epoch: int = Field(ge=0)


class Proposal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    intent: Literal["help", "consult", "create", "update", "handoff", "out_of_scope", "clarify"]
    reply: str = Field(max_length=4000)
    confidence: float = Field(ge=0, le=1)
    rationale: str = Field(max_length=1200)
    facts: dict[str, str | bool | None] = Field(default_factory=dict)
    article_ids: list[str] = Field(default_factory=list, max_length=8)
    tool_events: list[dict[str, str]] = Field(default_factory=list, max_length=12)
    usage: dict[str, int | float | str | None] = Field(default_factory=dict)
    mode: Literal["stub", "live"] = "live"
