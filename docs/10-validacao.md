# Evidências de validação

Execução local em 27/10/2026, com PostgreSQL 18 em Docker. CI e PRs fornecem o registro verificável da validação remota.

| Verificação | Evidência |
| --- | --- |
| TypeScript estrito | `npm run typecheck` em frontend e agente |
| Build de produção | `npm run build` e build Linux dos containers |
| API/domínio | 28 testes PostgreSQL, incluindo schemas isolados e migration upgrade/downgrade |
| Agente offline | 2 testes de contrato/intenção e preservação de desconhecidos |
| Navegador | 2 jornadas completas: confirmar chamado e atendimento funcionário/analista |
| Gemini real | Uma consulta de horário no modo live retornou intenção help, fonte hours e decisão válida |
| Uso no smoke real | 2.754 tokens de entrada, 423 de saída e aproximadamente 8,8s; medição de uma chamada, não benchmark |
| Reinício real | API, agente e web reiniciados; 5 mensagens, 1 rascunho, sessão e proprietário humano preservados |
| Visual | Login, histórico e decisões inspecionados no Chrome; fontes locais e layout extraídos do protótipo |

Testes relevantes: protocolo/conversa/rascunho alheios; origem externa; logout; confirmação repetida; revisão antiga; falha após commit; reabertura dentro/fora da janela; complemento sem zerar atraso; limite do agente sem bloquear humano; geração cancelada por handoff; dois analistas disputando simultaneamente; suporte humano durante indisponibilidade; retentativas do legado sem repetir o LLM.

O modo live foi validado com chave local, sem publicá-la ou registrar seu valor. A rotina CI usa stub, sem custo de provedor. O conjunto não prova acerto universal do modelo; mais cenários reais e calibragem da confiança são evoluções.

Não houve deploy público da aplicação. O repositório é público e o Compose expõe a aplicação somente em localhost. A API Python continua sendo uma exceção explícita ao requisito de linguagem do enunciado.
