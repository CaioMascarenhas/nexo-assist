# Estabilidade em 10 conversas reais — 30/10/2026

Foram exercitadas **10 conversas**, com **25 respostas reais do agente**, em Chrome, na aplicação local. **Nove cenários passaram sem ressalvas; um foi concluído depois de esclarecer a diferença entre um incidente novo e a reabertura de uma solicitação.** Não houve erro técnico, timeout ou fallback do modelo nesta amostra.

## Ambiente e métricas

- Aplicação: `http://localhost:3000`, modo `live`, modelo informado `google/gemini-3.8-flash`.
- Contas fictícias: Ana, Carla e Bruno; Luiza como N1 e Rafael como N2.
- Execução dos diálogos: 21h29–21h42, America/Fortaleza. As capturas finais foram conferidas novamente depois das transições assíncronas da interface.
- Teto da rodada: 40 mensagens processadas pelo agente; foram usadas 25. Essa contagem é por execução de triagem, não por passo interno de ferramenta do Mastra.
- Latência registrada pela API: **mínima 2,65 s; mediana 5,39 s; máxima 6,57 s**. A mediana anterior informada era 6,4 s; os roteiros e contextos são diferentes, portanto a comparação é descritiva.
- Uso informado pela aplicação: **70.170 tokens de entrada e 8.552 de saída**, sem estimativa de cobrança em dinheiro.
- **147 verificações registradas: 146 passaram e uma expectativa inicial de reabertura não foi atendida**, detalhada abaixo. A expectativa original não foi apagada para melhorar o resultado.
- Seis protocolos foram criados nesta rodada, todos deixados resolvidos. Os sete protocolos preexistentes ficaram inalterados, conforme comparação dos dados completos retornados pela API.

## Conversas e tentativas

| Conversa | Interações com IA | Fluxos exercitados e resultado |
| --- | ---: | --- |
| 01 — VPN | 2 | Ofereceu o artigo aplicável ao Windows 10. Após reinstalar e reiniciar, reconheceu a solução sem abrir protocolo. Passou. |
| 02 — Limites e cancelamento | 4 | Redirecionou reembolso, respondeu o horário com fonte, preparou requisição Baixa de Zettlr, permitiu editar e cancelar sem criar chamado. Protocolo de outro funcionário não foi exposto; API retornou 404. Passou. |
| 03 — FluxogramaQA | 1 | Criou após confirmação; repetição da confirmação foi idempotente. N1 encaminhou diretamente ao N2, que recebeu em Minhas e continuou o atendimento. IA pausada, SLA preservado na passagem e responsável anterior impedido de responder. Passou. |
| 04 — QGIS diferente | 2 | Com FluxogramaQA como candidato, a análise distinguiu programa e finalidade e criou outro protocolo. O histórico de FluxogramaQA permaneceu intacto. Inclui uma reavaliação de candidatos após a retomada da automação. Passou. |
| 05 — Mesmo QGIS | 2 | Outro relato da mesma instalação gerou uma pergunta de confirmação do assunto. Ao escolher o protocolo apresentado, preparou complemento no QGIS existente, sem criar duplicata. Passou. |
| 06 — Impressora Zebra | 2 | Perguntou o alcance desconhecido; incorporou alcance individual e alternativa na recepção, com prioridade Média. Encerramento sem resolver recebeu 409 e manteve o responsável. Passagem N1 → N2 conferida em 390 px. Passou. |
| 07 — Outlook | 2 | Ofereceu orientação. Depois da tentativa sem sucesso, reconheceu webmail como alternativa e preparou incidente Médio. O suporte recebeu o histórico das tentativas. Passou. |
| 08 — Acesso SharePoint | 5 | Pasta distinta da Financeiro recebeu protocolo próprio, inicialmente Alto. Anúncio de novas informações pediu o conteúdo. Cancelar reunião com alternativa reduziu para Média; remarcar e perder a alternativa elevou para Alta após esclarecer bloqueio. Editar incrementou a revisão. Os complementos preservaram a data da resposta do suporte. Passou. |
| 09 — Reabertura | 4 | Relato de falha após instalar virou proposta de incidente novo. A proposta foi cancelada. Ao esclarecer que a instalação original não estava concluída, preparou reabertura do mesmo protocolo. Cancelar preservou o resolvido; a nova tentativa confirmada preservou a primeira solução e recebeu a segunda. Concluído com ressalva. |
| 10 — Incidente crítico | 1 | Encaminhou imediatamente antes da confirmação. Assunção bloqueou o rascunho na interface e na API. N1 passou para N2 ainda sem protocolo; a IA permaneceu pausada. Devolver reabilitou a confirmação, seguida de resolução e encerramento. Passou. |

## Ressalva: novo incidente ou reabertura

O protocolo original do QGIS era uma **requisição de instalação**. O primeiro relato de retorno dizia que, **depois da instalação, o programa não abria**. O modelo classificou esse relato como um incidente novo, com justificativa coerente com a mudança de objetivo e tipo. A API manteve o protocolo selecionado, mas preparou `CREATE/INC`, sem alterar ou reabrir a requisição resolvida.

A expectativa inicial do roteiro era `REOPEN`; ela falhou e permanece nos registros. O novo incidente não foi confirmado. Depois, o funcionário corrigiu o relato explicitamente: a instalação original ainda não havia sido concluída e ele queria reabrir aquele protocolo. O sistema preparou `REOPEN` corretamente, permitiu cancelar e, em uma nova tentativa, confirmou a reabertura e preservou as soluções anteriores.

**Não foi comprovado um defeito funcional nesse caso.** Ficou uma oportunidade de continuidade: quando já existe um protocolo selecionado e o relato muda de instalação para falha de uso, perguntar se o funcionário quer reabrir a instalação ou registrar um novo incidente pode tornar a intenção mais clara.

## Apresentação e estado final

As três passagens N1 → N2 mantiveram atendimento humano e contexto. Nas duas passagens com protocolo já criado, o protocolo e o SLA foram preservados; no caso crítico, a conversa continuou sem protocolo até a confirmação. O N2 recebeu em Minhas, e o N1 perdeu as ações de responsável. Mensagens durante o atendimento humano não acionaram respostas adicionais da IA.

O painel do QGIS resolvido mostrou a segunda solução, autor e data, com histórico preservado e data de resolução no lugar do prazo futuro. **Em descrições longas, a solução ainda exige rolagem no painel lateral.** Aproximá-la do topo seria uma melhoria de ergonomia; não houve perda do registro. Não foi observada rolagem horizontal nas capturas conferidas.

| Protocolo novo | Assunto | Estado ao final da rodada |
| --- | --- | --- |
| REQ-F0D41C06 | FluxogramaQA | Resolvido, prioridade Baixa |
| REQ-F11F417B | QGIS | Resolvido, prioridade Alta; uma reabertura e duas soluções |
| INC-C8CB817F | Impressora Zebra | Resolvido, prioridade Média |
| INC-8D28871F | Outlook | Resolvido, prioridade Média |
| REQ-D5EABCB2 | Acesso à pasta do laboratório no SharePoint | Resolvido, prioridade Alta após redução e nova elevação confirmadas |
| INC-4A8F1277 | Equipe sem rede após switch apagar | Resolvido, prioridade Crítica |

Oito conversas ficaram encerradas. As conversas de orientação de VPN e de dúvidas/cancelamento ficaram com o assistente ativo, sem protocolo pendente. Não ficou atendimento humano sem responsável nem chamado novo aguardando tratamento.

## Evidências, intercorrências e reprodução

O roteiro está em [audit-live-flows.cjs](../scripts/audit-live-flows.cjs). Para visualizar o plano sem consumir o modelo:

```powershell
node scripts/audit-live-flows.cjs
```

Para outra rodada real, com a aplicação já em modo live:

```powershell
node scripts/audit-live-flows.cjs --run-live
```

A execução cria dados fictícios e consome o modelo configurado. `LIVE_RUN_ID` identifica a pasta; uma rodada existente exige `--resume`, que preserva as conversas e recupera mensagens respondidas sem reenviá-las. Não houve alteração de código da aplicação, reset do banco ou push durante esta auditoria. A alteração local de `.env.example` foi preservada.

Os diálogos, decisões, uso, métricas, verificações, capturas e estados finais ficaram localmente em `output/auditoria-10-conversas-rodada-1/`, ignorado pelo Git. Principais arquivos: `resultados.json`, `metricas.json`, `relatorio.md`, `*-conversa.json` e `evidencias-finais.json`.

A automação teve intercorrências na leitura de respostas pelo CDP, tanto no stream quanto em uma mensagem humana. As oito respostas iniciais estavam persistidas e foram recuperadas; uma etapa humana também foi retomada. Foram reutilizadas as mesmas dez conversas. A análise do QGIS foi reavaliada na mesma conversa depois de confirmar FluxogramaQA, para incluir o candidato que ainda não existia na primeira preparação. Essa chamada está incluída no total de 25. As evidências anteriores às retomadas foram preservadas separadamente.

Esta foi uma rodada sequencial de demonstração, não um teste de carga nem uma garantia de comportamento universal. As respostas do agente foram reais; notas de solução foram explicitamente identificadas como simuladas, sem executar instalações, permissões ou reparos de infraestrutura.
