from nexo.summaries import describe_facts


def test_handoff_summary_uses_portuguese_and_excludes_internal_flags():
    summary = describe_facts(
        {
            "affected_scope": "team",
            "blocked": True,
            "same_day": False,
            "kind": "INC",
            "os": "Windows 11",
            "_pending_update": True,
            "unexpected_metadata": "interno",
        }
    )
    assert "Pessoas afetadas: Equipe" in summary
    assert "Impede o trabalho: Sim" in summary
    assert "Compromisso em risco hoje: Não" in summary
    assert "Tipo: Incidente" in summary
    assert "affected_scope" not in summary
    assert "_pending_update" not in summary
    assert "interno" not in summary
