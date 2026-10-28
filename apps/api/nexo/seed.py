from datetime import timedelta

from sqlalchemy import select

from .database import SessionLocal
from .models import Article, Conversation, Message, Ticket, User, now

ARTICLES = [
    ("vpn-809", "VPN com erro 809", "No Windows 10, reinstale o cliente VPN pelo portal de softwares e reinicie. No Windows 11, abra um chamado; este procedimento não se aplica.", "vpn 809 conexão", "Windows 10"),
    ("hours", "Horário do service desk", "Atendimento de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.", "horário atendimento plantão", "all"),
    ("sap", "SAP: senha bloqueada", "Use o portal de identidade para desbloquear a conta. Se não funcionar, solicite suporte de Acesso. Nunca compartilhe sua senha.", "sap senha acesso bloqueada", "all"),
    ("notebook", "Notebook lento", "Reinicie e execute o diagnóstico no portal de softwares. Anote quando começou e se há alternativa para trabalhar.", "notebook lento lentidão windows", "all"),
    ("monitor", "Solicitação de monitor", "Informe o equipamento desejado, justificativa e local de entrega. A solicitação depende de aprovação do suporte.", "monitor equipamento compra", "all"),
    ("outlook", "Outlook sem sincronizar", "Confira sua conexão, reinicie o Outlook e verifique a caixa de saída. Se persistir, informe desde quando ocorre.", "outlook email sincroniza", "all"),
    ("software", "Instalar software", "Procure o aplicativo no portal de softwares. Se não estiver disponível, informe nome, justificativa e urgência.", "software instalar programa", "all"),
    ("sharepoint", "Acesso a pastas no SharePoint", "Informe o endereço da pasta, justificativa de acesso e prazo necessário. Nunca envie arquivos confidenciais no chat.", "sharepoint pasta acesso", "all"),
]


def seed() -> None:
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)):
            return
        users = [
            User(id="ana", name="Ana Souza", email="ana.souza@nexo.com.br", department="Financeiro"),
            User(id="carla", name="Carla Mendes", email="carla.mendes@nexo.com.br", department="Comercial"),
            User(id="bruno", name="Bruno Tavares", email="bruno.tavares@nexo.com.br"),
            User(id="rafael", name="Rafael Lima", email="rafael.lima@nexo.com.br", role="ANALYST", department="Suporte N2"),
            User(id="luiza", name="Luiza Costa", email="luiza.costa@nexo.com.br", role="ANALYST", department="Suporte N1"),
        ]
        db.add_all(users)
        db.flush()
        instant = now()
        rows = [
            ("ana", "INC-20311", "Notebook lento após atualização do Windows", "Hardware", "MEDIUM", "WAITING_ANALYST", -6),
            ("ana", "INC-20298", "Acesso à pasta Financeiro no SharePoint", "Acesso", "HIGH", "IN_PROGRESS", 1),
            ("ana", "REQ-10442", "Segundo monitor para home office", "Hardware", "LOW", "APPROVED", 3),
            ("ana", "INC-20150", "Senha do SAP bloqueada", "Acesso", "MEDIUM", "RESOLVED", -4),
            ("ana", "INC-19877", "Outlook não sincroniza no celular", "E-mail", "MEDIUM", "RESOLVED", -20),
            ("carla", "INC-20888", "Notebook lento após atualização do Windows", "Hardware", "HIGH", "OPEN", 1),
        ]
        for owner, code, title, category, priority, status, days in rows:
            db.add(Ticket(id=code, code=code, user_id=owner, title=title,
                          description=f"{title}. Relato inicial do funcionário; diagnóstico ainda em acompanhamento.",
                          kind=code[:3], category=category, priority=priority, status=status,
                          created_at=instant-timedelta(days=8), support_updated_at=instant-timedelta(days=6),
                          due_at=instant+timedelta(days=days),
                          resolved_at=instant+timedelta(days=days) if status == "RESOLVED" else None))
        db.add_all([Article(id=i, title=t, content=c, tags=tags, applies_to=a) for i,t,c,tags,a in ARTICLES])
        conv = Conversation(id="demo-ana", user_id="ana")
        db.add(conv)
        db.flush()
        db.add(Message(conversation_id=conv.id, role="AGENT", author="Nexo Assist",
                       content="Olá, Ana. Como posso ajudar com seu problema de TI hoje?",
                       data={"quickReplies": ["Consultar meus chamados", "Preciso de ajuda com a VPN", "Falar com um analista"]}))
        db.commit()


if __name__ == "__main__":
    seed()
