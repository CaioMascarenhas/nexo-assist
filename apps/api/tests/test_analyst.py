from conftest import login


def test_simultaneous_claim_has_exactly_one_winner(client,database):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from sqlalchemy.orm import Session
    from fastapi import HTTPException
    from nexo.analyst_routes import claim
    from nexo.models import User
    from nexo.schemas import TransitionBody
    login(client)
    conv=client.post("/conversations").json()["id"]
    waiting=client.post(f"/conversations/{conv}/handoff").json()
    barrier=Barrier(2)
    def attempt(user_id):
        with Session(database.bind,expire_on_commit=False) as session:
            actor=session.get(User,user_id)
            barrier.wait(timeout=5)
            try:
                claim(conv,TransitionBody(epoch=waiting["epoch"]),session,actor)
                return 200
            except HTTPException as error:
                session.rollback()
                return error.status_code
    with ThreadPoolExecutor(max_workers=2) as executor:
        results=list(executor.map(attempt,["support","support2"]))
    assert sorted(results)==[200,409]


def test_analyst_claim_exclusive_and_release(client):
    login(client)
    conv=client.post("/conversations").json()["id"]
    assert client.get("/analyst/conversations").status_code==403
    waiting=client.post(f"/conversations/{conv}/handoff").json()
    login(client,"support")
    assert client.post(f"/analyst/conversations/{conv}/messages",json={"content":"Oi","client_id":"early"}).status_code==409
    claimed=client.post(f"/analyst/conversations/{conv}/claim",json={"epoch":waiting["epoch"]})
    assert claimed.status_code==200
    login(client,"support2")
    assert client.post(f"/analyst/conversations/{conv}/claim",json={"epoch":waiting["epoch"]}).status_code==409
    assert client.post(f"/analyst/conversations/{conv}/release",json={"epoch":claimed.json()["epoch"]}).status_code==409
    login(client,"support")
    assert client.post(f"/analyst/conversations/{conv}/messages",json={"content":"Vou ajudar você.","client_id":"human"}).status_code==200
    released=client.post(f"/analyst/conversations/{conv}/release",json={"epoch":claimed.json()["epoch"]})
    assert released.json()["state"]=="AGENT_ACTIVE"
    login(client)
    assert any(m["role"]=="ANALYST" for m in client.get(f"/conversations/{conv}").json()["messages"])


def test_close_preserves_ticket_independence_and_blocks_new_messages(client):
    login(client)
    conv=client.post("/conversations").json()["id"]
    waiting=client.post(f"/conversations/{conv}/handoff").json()
    login(client,"support")
    claimed=client.post(f"/analyst/conversations/{conv}/claim",json={"epoch":waiting["epoch"]}).json()
    assert client.post(f"/analyst/conversations/{conv}/close",json={"epoch":claimed["epoch"]}).json()["state"]=="CLOSED"
    login(client)
    assert client.post(f"/conversations/{conv}/messages",json={"content":"Olá","client_id":"closed"}).status_code==409
