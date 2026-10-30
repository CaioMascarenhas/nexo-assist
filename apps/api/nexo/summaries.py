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


def describe_request(facts: dict, reports: list[str]) -> str:
    """Fatos atuais prevalecem; dúvidas anteriores ficam apenas como histórico."""
    current = describe_facts({key: value for key, value in facts.items() if key != "description"})
    history = "\n\n".join(
        f"{'Relato inicial' if index == 0 else 'Esclarecimento ' + str(index)}: {report}"
        for index, report in enumerate(reports)
    )
    heading = f"Contexto atual confirmado:\n{current}"
    if not history:
        return heading[:6000]
    label = "\n\nHistórico do relato (os esclarecimentos mais recentes prevalecem):\n"
    available = max(0, 6000 - len(heading) - len(label))
    return (heading + label + (history[-available:] if available else ""))[:6000]
