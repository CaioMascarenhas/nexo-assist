"""Três cenários reais e limitados; usa créditos do Gemini configurado localmente."""

import json
from uuid import uuid4

import httpx

scenarios = [
    ("horário", "Qual é o horário do service desk?", "help", "AGENT_ACTIVE"),
    (
        "fora de TI",
        "Preciso solicitar reembolso de uma viagem ao financeiro.",
        "out_of_scope",
        "AGENT_ACTIVE",
    ),
    (
        "crítico",
        "Todos da minha equipe estão com os notebooks travados. Ninguém consegue trabalhar, não existe alternativa.",
        None,
        "WAITING_ANALYST",
    ),
]
with httpx.Client(base_url="http://127.0.0.1:8000", timeout=55) as client:
    client.post(
        "/auth/login", json={"email": "ana.souza@nexo.com.br", "password": "demo"}
    ).raise_for_status()
    assert client.get("/runtime").json()["mode"] == "live", (
        "O agente deve estar em modo real."
    )
    for name, content, intent, state in scenarios:
        created = client.post("/conversations")
        created.raise_for_status()
        conversation = created.json()["id"]
        response = client.post(
            f"/conversations/{conversation}/messages",
            json={"content": content, "client_id": str(uuid4())},
        )
        response.raise_for_status()
        events = [
            json.loads(line[6:])
            for line in response.text.splitlines()
            if line.startswith("data: ")
        ]
        decisions = [event["data"] for event in events if event["type"] == "decision"]
        assert decisions, f"Sem decisão validada no cenário {name}."
        decision = decisions[-1]
        assert decision["mode"] == "live"
        if intent:
            assert decision["intent"] == intent, f"Intenção inesperada em {name}."
        history = client.get(f"/conversations/{conversation}").json()
        assert history["state"] == state, f"Estado inesperado em {name}."
        assert not any(d["status"] == "PENDING" for d in history["drafts"]), (
            f"Operação pendente indevida em {name}."
        )
        if name == "horário":
            assert any(
                source["id"] == "hours" and source["applicable"]
                for source in decision["sources"]
            )
        if name == "crítico":
            assert history["handoff_reason"] == "CRITICAL"
            assert history["selected_ticket_id"], "Incidente crítico completo deve ter protocolo."
            ticket = client.get(f"/tickets/{history['selected_ticket_id']}").json()
            assert ticket["priority"] == "CRITICAL"
        print(
            json.dumps(
                {
                    "cenario": name,
                    "modo": decision["mode"],
                    "intencao": decision["intent"],
                    "estado": history["state"],
                    "duracao_ms": decision["duration_ms"],
                    "uso": decision["usage"],
                },
                ensure_ascii=False,
            )
        )
