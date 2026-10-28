from nexo.chat_routes import apply_proposal
from nexo.models import Article, Conversation, User
from nexo.schemas import Proposal
from nexo.ticket_service import TicketService


def test_failed_windows10_guidance_continues_to_confirmable_draft(database):
    user = database.get(User, "alice")
    conv = Conversation(user_id=user.id)
    database.add_all(
        [
            conv,
            Article(
                id="vpn-809",
                title="VPN",
                content="Reinstale e reinicie. Apenas Windows 10.",
                applies_to="Windows 10",
                tags="VPN",
            ),
        ]
    )
    database.flush()
    service = TicketService(database, user)

    def step(content, intent="create", **facts):
        proposal = Proposal(
            intent=intent, reply="", confidence=0.9, rationale="Teste da sequência", mode="stub", facts=facts
        )
        result = apply_proposal(database, user, conv, proposal, service, [], content)
        database.commit()
        return result

    reply, data = step(
        "VPN no Windows 10",
        title="VPN erro 809",
        description="Não conecta",
        category="Rede e VPN",
        kind="INC",
        os="Windows 10",
    )
    assert "Reinstale" in reply
    reply, data = step("Continua sem funcionar", intent="update")
    assert "Quem está sendo afetado" in reply
    reply, data = step("Só eu", affected_scope="individual")
    assert "impede" in reply
    assert "Reinstale" not in reply
    reply, data = step("Não consigo trabalhar", blocked=True)
    assert data["draft"]["operation"] == "CREATE"
    assert data["draft"]["payload"]["priority"] == "HIGH"
    assert all(not key.startswith("_") for key in data["decision"]["facts"])


def test_windows11_never_receives_windows10_instruction(database):
    user = database.get(User, "alice")
    conv = Conversation(user_id=user.id)
    database.add_all(
        [
            conv,
            Article(
                id="vpn-809", title="VPN", content="Reinstale o cliente", applies_to="Windows 10", tags="VPN"
            ),
        ]
    )
    database.flush()
    proposal = Proposal(
        intent="help",
        reply="",
        confidence=0.9,
        rationale="Restrição de SO",
        mode="stub",
        facts={"category": "Rede e VPN", "os": "Windows 11"},
        article_ids=["vpn-809"],
    )
    reply, data = apply_proposal(
        database, user, conv, proposal, TicketService(database, user), [], "Como resolver no Windows 11?"
    )
    assert "Reinstale" not in reply
    assert data["decision"]["sources"][0]["applicable"] is False
