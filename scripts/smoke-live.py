"""One bounded live conversation. No credentials or session tokens are printed."""

import json
import os

import httpx

base = os.getenv("SMOKE_URL", "http://127.0.0.1:8000")
with httpx.Client(base_url=base, timeout=55) as client:
    client.post(
        "/auth/login", json={"email": "ana.souza@nexo.com.br", "password": "demo"}
    ).raise_for_status()
    response = client.post("/conversations")
    response.raise_for_status()
    conversation = response.json()["id"]
    result = client.post(
        f"/conversations/{conversation}/messages",
        json={
            "content": "Qual é o horário do service desk?",
            "client_id": "smoke-live-hours",
        },
    )
    result.raise_for_status()
    events = [
        json.loads(line[6:])
        for line in result.text.splitlines()
        if line.startswith("data: ")
    ]
    decisions = [event["data"] for event in events if event["type"] == "decision"]
    if not decisions:
        print("Live smoke failed: no validated decision returned.")
        raise SystemExit(1)
    decision = decisions[-1]
    print(
        json.dumps(
            {
                "mode": decision["mode"],
                "intent": decision["intent"],
                "actions": decision["actions"],
                "sources": [s["id"] for s in decision["sources"]],
                "usage": decision["usage"],
            },
            ensure_ascii=False,
        )
    )
    if decision["mode"] != "live":
        raise SystemExit("Expected live mode; fixture is not a live validation.")
