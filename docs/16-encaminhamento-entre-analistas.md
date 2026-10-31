# Encaminhamento direto N1 → N2

O analista responsável pode encaminhar o atendimento diretamente para outro analista. Nas contas de demonstração, Luiza Costa está cadastrada como Suporte N1 e Rafael Lima como Suporte N2. Não é mais necessário devolver à IA nem pedir que o funcionário solicite atendimento humano novamente.

## Fluxo no console

1. O N1 assume a conversa e seleciona **Encaminhar atendimento**.
2. Escolhe **Rafael Lima · Suporte N2** em **Analista de destino** e informa o **Motivo do encaminhamento**.
3. Confirma o encaminhamento. O N2 recebe a conversa diretamente em **Minhas**, pronta para responder, com o histórico, o resumo e o protocolo preservados.

A identificação do responsável aparece para o funcionário e para os analistas. Depois da passagem, o N1 continua podendo consultar o histórico, mas perde as ações de responsável: responder, resolver, devolver, encerrar ou encaminhar novamente. O N2 pode dar continuidade imediatamente, sem uma etapa adicional de assunção.

O mecanismo permite encaminhar para outros analistas cadastrados, inclusive retornar do N2 para o N1. N1/N2 continuam sendo identificações do cadastro, sem novas hierarquias de permissão ou roteamento automático por nível. A lista mostra nome e área, sem afirmar disponibilidade real; a presença na demonstração é simulada.

## Integridade e responsabilidade

- O atendimento permanece em `HUMAN_ACTIVE` com o destinatário como responsável, sem passar pelo agente ou por uma fila sem responsável. A IA continua pausada e as mensagens do funcionário continuam sendo entregues ao atendimento humano.
- A API exige perfil de analista, responsabilidade atual, versão atual da conversa, outro destinatário com perfil de analista e motivo de 5 a 1.200 caracteres. A troca é protegida por lock e incremento do `epoch`: dois encaminhamentos simultâneos produzem um único vencedor e um único registro.
- A conversa registra autor, destinatário, motivo e data. O resumo anterior é preservado e recebe o motivo da passagem. O histórico do chamado também recebe o encaminhamento e apresenta os nomes dos analistas e o motivo.
- O protocolo vinculado permanece o mesmo. Chamados abertos ficam em andamento; protocolos resolvidos continuam resolvidos. O encaminhamento não cria, reabre ou resolve chamados automaticamente.
- A troca de responsável preserva prioridade, prazo e data da última resposta do suporte. Uma resposta substantiva posterior do N2 segue a regra normal de atualização do SLA.

Quando o legado está indisponível, o atendimento humano ainda pode ser encaminhado: a conversa registra a passagem e avisa que o registro no chamado ficou indisponível. O destinatário permanece responsável e o prazo não é renovado. A sincronização automática posterior continua fora do escopo. Outros erros, como vínculo com protocolo de outro funcionário, impedem a passagem e preservam o responsável anterior.

## Validação

Os testes PostgreSQL cobrem troca de responsabilidade, permissões revogadas do N1, continuidade e resolução pelo N2, filtros, preservação do SLA e do histórico, IA pausada, destinatários inválidos, motivo vazio, versão desatualizada, estados não elegíveis, conversas sem protocolo, protocolos já resolvidos, concorrência e indisponibilidade do legado.

A jornada Playwright realiza a passagem Luiza → Rafael com um protocolo existente. Confere o formulário em desktop e em 390 px, a chegada em **Minhas**, a ausência de nova assunção, as mensagens entre funcionário e N2 e a preservação do protocolo e do SLA durante a troca. A validação usa o ambiente Docker isolado e não consome chamadas reais ao modelo.

Não houve migração de banco nem reatribuição automática dos atendimentos antigos: a responsabilidade usa o campo de analista que já existia na conversa, e a auditoria utiliza os históricos existentes.
