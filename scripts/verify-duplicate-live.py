"""Duas chamadas reais, somente leitura, para verificar o contrato de duplicidade.

Execute dentro do contêiner da API, com o agente em modo live:
Get-Content -Raw -Encoding utf8 scripts/verify-duplicate-live.py | docker compose exec -T api python -
"""

import asyncio
import json

from nexo.chat_routes import request_proposal
from nexo.duplicates import supported_evidence


async def main():
    for name, title, description, expected in [
        (
            "programas_diferentes",
            "Instalação do software FluxogramaQA",
            "Instalar FluxogramaQA para diagramas de processos.",
            "different",
        ),
        (
            "mesmo_pedido",
            "Disponibilizar QGIS no computador",
            "Solicitação de instalação do QGIS para mapas geológicos.",
            "same",
        ),
    ]:
        candidate = {
            "id": "verificacao-somente-leitura",
            "code": "REQ-VERIFICACAO",
            "version": 1,
            "title": title,
            "description": description,
            "category": "Software",
            "kind": "REQ",
            "status": "OPEN",
        }
        content = "Preciso instalar QGIS para mapas geológicos. Só eu, tenho alternativa e não há urgência."
        result = await request_proposal(
            {
                "content": content,
                "facts": {},
                "messages": [],
                "tickets": [candidate],
                "articles": [],
                "duplicate_candidates": [candidate],
            }
        )
        assert result.mode == "live", "A verificação exige o agente real, sem fallback."
        assert len(result.duplicate_reviews) == 1, (
            "O candidato precisa de uma análise explícita."
        )
        review = result.duplicate_reviews[0]
        assert review.ticket_id == candidate["id"] and review.result == expected, (
            f"Resultado inesperado em {name}."
        )
        if expected == "same":
            assert supported_evidence(review, content, candidate), (
                "A associação precisa de evidências verificáveis."
            )
        print(
            json.dumps(
                {
                    "scenario": name,
                    "result": review.result,
                    "mode": result.mode,
                    "usage": result.usage,
                },
                ensure_ascii=True,
            )
        )


asyncio.run(main())
