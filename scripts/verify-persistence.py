"""Verify a real process restart without deleting volumes or printing session tokens."""

import json
import subprocess
import time
from uuid import uuid4

import httpx

base = "http://127.0.0.1:8000"
with (
    httpx.Client(base_url=base, timeout=55) as employee,
    httpx.Client(base_url=base, timeout=55) as analyst,
):
    employee.post(
        "/auth/login", json={"email": "bruno.tavares@nexo.com.br", "password": "demo"}
    ).raise_for_status()
    analyst.post(
        "/auth/login", json={"email": "rafael.lima@nexo.com.br", "password": "demo"}
    ).raise_for_status()
    created = employee.post("/conversations")
    created.raise_for_status()
    conversation = created.json()["id"]
    response = employee.post(
        f"/conversations/{conversation}/messages",
        json={
            "content": "VPN erro 809 no Windows 11. Só eu, não consigo trabalhar.",
            "client_id": str(uuid4()),
        },
    )
    response.raise_for_status()
    before = employee.get(f"/conversations/{conversation}").json()
    assert any(d["status"] == "PENDING" for d in before["drafts"]), (
        "Expected pending draft before restart"
    )
    paused = employee.post(f"/conversations/{conversation}/handoff").json()
    claimed = analyst.post(
        f"/analyst/conversations/{conversation}/claim", json={"epoch": paused["epoch"]}
    )
    claimed.raise_for_status()
    before = employee.get(f"/conversations/{conversation}").json()
    subprocess.run(["docker", "compose", "restart", "api", "agent", "web"], check=True)
    for attempt in range(30):
        try:
            after = employee.get(f"/conversations/{conversation}")
            if after.status_code == 200:
                break
        except httpx.HTTPError:
            pass
        time.sleep(1)
    after.raise_for_status()
    restored = after.json()
    assert restored["state"] == "HUMAN_ACTIVE"
    assert restored["analyst_id"] == "rafael"
    assert [m["id"] for m in restored["messages"]] == [
        m["id"] for m in before["messages"]
    ]
    assert [d["id"] for d in restored["drafts"]] == [d["id"] for d in before["drafts"]]
    assert restored["turns"] == before["turns"]
    print(
        json.dumps(
            {
                "restart_verified": True,
                "messages": len(restored["messages"]),
                "drafts": len(restored["drafts"]),
                "state": restored["state"],
            }
        )
    )
