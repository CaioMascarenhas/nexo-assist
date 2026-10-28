"""Resumo de fatos legível pelo suporte, sem expor metadados do agente."""

FACT_LABELS = {
    "os": "Sistema operacional",
    "category": "Categoria",
    "title": "Título",
    "description": "Descrição",
    "kind": "Tipo",
    "affected_scope": "Pessoas afetadas",
    "blocked": "Impede o trabalho",
    "same_day": "Compromisso em risco hoje",
    "workaround": "Há alternativa para continuar",
}
VALUES = {
    "individual": "Somente o funcionário",
    "team": "Equipe",
    "company": "Empresa inteira",
    "INC": "Incidente",
    "REQ": "Requisição",
}


def describe_facts(facts: dict) -> str:
    lines = []
    for field, label in FACT_LABELS.items():
        value = facts.get(field)
        if value is None:
            continue
        displayed = ("Sim" if value else "Não") if isinstance(value, bool) else VALUES.get(value, str(value))
        lines.append(f"{label}: {displayed}")
    return "\n".join(lines) or "Ainda não há fatos confirmados."
