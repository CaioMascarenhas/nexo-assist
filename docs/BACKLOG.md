# Backlog e entregas

O desenvolvimento foi feito em branches, commits incrementais e PRs. Consulte as issues para critérios de aceite e os checks das PRs para evidências.

| Entrega | Issue | PRs | Estado |
| --- | --- | --- | --- |
| Fundação e Compose | [#1](https://github.com/CaioMascarenhas/nexo-assist/issues/1) | [#9](https://github.com/CaioMascarenhas/nexo-assist/pull/9) | Integrada |
| Domínio/SLA/reabertura | [#2](https://github.com/CaioMascarenhas/nexo-assist/issues/2) | [#10](https://github.com/CaioMascarenhas/nexo-assist/pull/10) | Integrada |
| API e privacidade | [#3](https://github.com/CaioMascarenhas/nexo-assist/issues/3) | [#11](https://github.com/CaioMascarenhas/nexo-assist/pull/11), [#13](https://github.com/CaioMascarenhas/nexo-assist/pull/13) | Integrada |
| Mastra/Gemini e decisões | [#4](https://github.com/CaioMascarenhas/nexo-assist/issues/4) | [#12](https://github.com/CaioMascarenhas/nexo-assist/pull/12), [#13](https://github.com/CaioMascarenhas/nexo-assist/pull/13) | Integrada; smoke live validado |
| Chamados e confirmação | [#5](https://github.com/CaioMascarenhas/nexo-assist/issues/5) | [#13](https://github.com/CaioMascarenhas/nexo-assist/pull/13) | Integrada |
| Interface do protótipo | [#6](https://github.com/CaioMascarenhas/nexo-assist/issues/6) | [#15](https://github.com/CaioMascarenhas/nexo-assist/pull/15) | Integrada |
| Console/concorrência | [#7](https://github.com/CaioMascarenhas/nexo-assist/issues/7) | [#14](https://github.com/CaioMascarenhas/nexo-assist/pull/14), [#15](https://github.com/CaioMascarenhas/nexo-assist/pull/15) | Integrada |
| CI/validação/documentação | [#8](https://github.com/CaioMascarenhas/nexo-assist/issues/8) | [#16](https://github.com/CaioMascarenhas/nexo-assist/pull/16) | Integrada |

A revisão de 28/10/2026 está registrada na [auditoria do desafio](11-auditoria-do-desafio.md), com mapeamento individual das issues 19–43 para as respectivas PRs. A [issue 22](https://github.com/CaioMascarenhas/nexo-assist/issues/22) reúne a bateria ampliada e a matriz de aderência ao PDF/protótipo.

Materiais originais do processo seletivo são locais. O repositório contém o inventário visual sanitizado e as licenças das fontes utilizadas.

## Ajustes e auditoria de 30/10/2026

As entregas abaixo formalizam as mudanças solicitadas e as correções verificadas nesta sessão. Os checks de cada PR registram a validação antes do merge.

| Entrega | Issue | PR |
| --- | --- | --- |
| Corrigir truncamento aumentando a saída do agente para 4.000 tokens | [#47](https://github.com/CaioMascarenhas/nexo-assist/issues/47) | [#55](https://github.com/CaioMascarenhas/nexo-assist/pull/55) |
| Registrar chamados automaticamente e encaminhar a conversa para a fila humana | [#48](https://github.com/CaioMascarenhas/nexo-assist/issues/48) | [#56](https://github.com/CaioMascarenhas/nexo-assist/pull/56) |
| Garantir protocolo para incidente crítico com contexto suficiente | [#49](https://github.com/CaioMascarenhas/nexo-assist/issues/49) | [#57](https://github.com/CaioMascarenhas/nexo-assist/pull/57) |
| Concluir orientação quando o usuário confirma que o problema foi resolvido | [#50](https://github.com/CaioMascarenhas/nexo-assist/issues/50) | [#58](https://github.com/CaioMascarenhas/nexo-assist/pull/58) |
| Diagnosticar falhas do modelo e reservar os passos finais para a decisão | [#51](https://github.com/CaioMascarenhas/nexo-assist/issues/51) | [#59](https://github.com/CaioMascarenhas/nexo-assist/pull/59) |
| Permitir que o analista responsável resolva o chamado com registro da solução | [#52](https://github.com/CaioMascarenhas/nexo-assist/issues/52) | [#60](https://github.com/CaioMascarenhas/nexo-assist/pull/60) |
| Atualizar o exemplo do login e o campo de atendimento encerrado | [#53](https://github.com/CaioMascarenhas/nexo-assist/issues/53) | [#61](https://github.com/CaioMascarenhas/nexo-assist/pull/61) |
| Registrar correções da auditoria e a verificação live reproduzível | [#54](https://github.com/CaioMascarenhas/nexo-assist/issues/54) | [#62](https://github.com/CaioMascarenhas/nexo-assist/pull/62) |
| Restaurar rascunho e confirmação antes de criar, complementar ou reabrir chamados, preservando o encaminhamento após confirmar | [#63](https://github.com/CaioMascarenhas/nexo-assist/issues/63) | [#64](https://github.com/CaioMascarenhas/nexo-assist/pull/64) |
| Perguntar somente impacto ou urgência ainda desconhecidos, sem repetir os dados já informados | [#65](https://github.com/CaioMascarenhas/nexo-assist/issues/65) | [#66](https://github.com/CaioMascarenhas/nexo-assist/pull/66) |
| Preservar o relato durante esclarecimentos e separar complemento de chamado da orientação inicial de VPN | [#67](https://github.com/CaioMascarenhas/nexo-assist/issues/67) | [#68](https://github.com/CaioMascarenhas/nexo-assist/pull/68) |
| Reavaliar prioridade para cima ou para baixo com fatos suficientes, resumo e perguntas contextuais da IA, justificativa e confirmação | [#69](https://github.com/CaioMascarenhas/nexo-assist/issues/69) | [#70](https://github.com/CaioMascarenhas/nexo-assist/pull/70) |
