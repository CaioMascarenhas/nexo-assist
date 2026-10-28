import json
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from conftest import login
from nexo import chat_routes
from nexo.models import Conversation, Draft, Message, now
from nexo.schemas import Proposal


def proposal(**overrides):
    return Proposal(intent="create",reply="Proposta",confidence=.9,rationale="Evidência de teste",mode="stub",
                    facts={"title":"VPN erro 809", "description":"Windows 11 sem VPN", "kind":"INC", "category":"Rede e VPN",
                           "os":"Windows 11", "affected_scope":"individual", "blocked":True}, **overrides)


def events(response):
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]


def test_chat_requires_confirmation_deduplicates_and_limits(client,database,monkeypatch):
    async def fake(_): return proposal()
    monkeypatch.setattr(chat_routes,"request_proposal",fake)
    login(client)
    conv = client.post("/conversations").json()["id"]
    response = client.post(f"/conversations/{conv}/messages",json={"content":"VPN sem funcionar","client_id":"once"})
    assert response.status_code == 200
    assert any(e["type"]=="done" for e in events(response))
    assert database.scalar(select(Draft).where(Draft.conversation_id==conv)) is not None
    assert client.post(f"/conversations/{conv}/messages",json={"content":"VPN sem funcionar","client_id":"once"}).json()["replayed"]
    saved = database.get(Conversation,conv)
    assert saved.turns == 1
    saved.turns = 30
    database.commit()
    assert client.post(f"/conversations/{conv}/messages",json={"content":"Olá","client_id":"31"}).status_code==429
    assert client.post(f"/conversations/{conv}/handoff").status_code==200
    assert client.post(f"/conversations/{conv}/messages",json={"content":"Aguardando","client_id":"human"}).json()["agent_paused"]


def test_handoff_during_generation_discards_agent_reply(client,database,monkeypatch):
    login(client)
    conv_id = client.post("/conversations").json()["id"]
    async def transfer_during_generation(_):
        with Session(database.bind) as concurrent:
            conv = concurrent.get(Conversation,conv_id)
            conv.state = "WAITING_ANALYST"
            conv.epoch += 1
            concurrent.commit()
        return proposal()
    monkeypatch.setattr(chat_routes,"request_proposal",transfer_during_generation)
    response = client.post(f"/conversations/{conv_id}/messages",json={"content":"VPN","client_id":"race"})
    assert any(e["type"]=="paused" for e in events(response))
    assert database.scalar(select(Draft).where(Draft.conversation_id==conv_id)) is None
    messages=list(database.scalars(select(Message).where(Message.conversation_id==conv_id,Message.role=="AGENT")))
    assert len(messages)==1  # Only initial greeting, no late generated reply.


def test_expired_generation_can_be_retried_without_unlocking_human_state(client,database,monkeypatch):
    login(client)
    conv_id = client.post("/conversations").json()["id"]
    conv=database.get(Conversation,conv_id)
    conv.busy_until=now()-timedelta(minutes=1)
    database.commit()
    async def fake(_): return proposal()
    monkeypatch.setattr(chat_routes,"request_proposal",fake)
    assert client.get(f"/conversations/{conv_id}").json()["interrupted"]
    response=client.post(f"/conversations/{conv_id}/messages",json={"content":"Retomar VPN","client_id":"retry"})
    assert any(e["type"]=="done" for e in events(response))
