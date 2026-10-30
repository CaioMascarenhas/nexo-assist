# Correções da auditoria de 30/10/2026

> Registro histórico da auditoria anterior. A issue #63 restaurou o rascunho e a confirmação do funcionário; os trechos abaixo sobre registro automático foram substituídos pelo fluxo descrito em [Confirmação restaurada](13-confirmacao-restaurada.md). As demais correções permanecem.

O fluxo continua registrando chamados automaticamente após a coleta e encaminhando à fila humana, conforme solicitado pelo autor. Inferências contextuais continuam permitidas; dúvida explícita deve gerar esclarecimento antes do registro.

## Comportamentos corrigidos

1. **Criticidade com dados completos:** a API registra ou atualiza o protocolo antes de pausar e transferir. Contexto insuficiente ou baixa confiança ainda permite encaminhar a conversa sem inventar um chamado. Duplicidade, prioridade e transação usam o mesmo serviço dos outros registros automáticos. Uma consulta de status não reutiliza fatos críticos antigos para reabrir o chamado.
2. **Orientação resolvida:** o contrato do agente inclui `resolved`. A API reconhece a conclusão antes de reapresentar artigos e limpa os fatos da triagem. Não cria nem resolve protocolos existentes em nome do usuário; resolução de chamado é ação do suporte.
3. **Falhas de geração:** código distingue timeout, quota, autenticação, truncamento, saída inválida e indisponibilidade. Logs do servidor Node e da API compartilham `request_id`. Somente códigos fixos, duração, status e campos conhecidos de validação são registrados; erros brutos do SDK ficam suprimidos. A interface mostra mensagens técnicas específicas, mantém o histórico e permite retentativa explícita.
4. **Limites de geração:** mantém 4.000 tokens, até quatro passos e 35 segundos. Saída é concisa; Gemini 3/4 usa esforço baixo. Depois das duas primeiras etapas, desativa ferramentas para reservar a decisão final. Erros retornados no resultado do SDK são propagados, em vez de serem confundidos com ausência de objeto. Não há repetição automática da chamada paga.
5. **Resolver chamado:** o analista responsável informa a solução na interface. A API exige papel de analista, propriedade atual da conversa, `epoch`, chamado vinculado, dono compatível, versão atual e nota não vazia. Grava `RESOLVED`, data e histórico da solução. Falha no legado não anuncia sucesso. A conversa permanece humana até devolução ou encerramento.
6. **Textos:** o exemplo do login descreve o registro automático. Conversa encerrada mostra “Atendimento encerrado”, em vez de pedir assunção indisponível. O formulário de resolução fica acessível também no celular.

## Verificação

- Testes PostgreSQL cobrem criação/atualização crítica, conclusão de orientação sem escrita, consulta depois da resolução, autorização e concorrência por versão na resolução, indisponibilidade e diagnóstico sem dados sensíveis.
- Testes do agente cobrem distinção entre resolução e orientação que falhou, classificação de falhas e sanitização dos diagnósticos.
- `tests/e2e/regressions.spec.ts` percorre as três regressões principais no navegador em modo stub. Os demais testes preservam as jornadas anteriores.
- `scripts/verify-live-fixes.cjs` verifica os cenários com o modelo real e registra evidências em `output/verificacao-correcoes-live`.

Na primeira validação real, VPN e conclusão funcionaram; uma geração crítica retornou saída inválida. Foi então acrescentada a reserva dos passos finais e maior precisão dos diagnósticos. A repetição da mesma conversa criou o protocolo crítico, permitiu resolução pela analista e encerramento. O caso de dúvida explícita também pediu esclarecimento, sem chamado.

Uma amostra de chamadas reais não garante disponibilidade ou correção universal do provedor. Os limites, falhas explícitas, transações e canal humano continuam necessários.
