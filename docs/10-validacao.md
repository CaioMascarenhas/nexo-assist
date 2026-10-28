# Evidências de validação

## Revisão de 28/10/2026

A [auditoria](11-auditoria-do-desafio.md) registra a matriz de requisitos/telas e as correções encontradas. A bateria foi ampliada para **56 testes de API**, **2 do agente** e **19 jornadas de navegador**. Os resultados remotos ficam nos checks das PRs.

O conjunto de 19 jornadas passou localmente em 41,7 segundos no ambiente isolado, antes do ajuste final de texto do resumo/contagens. A versão final também é verificada no CI. Inclui criação após edição, cancelamento, duplicidade após título resumido, complemento, reabertura, transferências obrigatórias, encerramento, erros, privacidade e respostas de rede fora de ordem. Capturas de desktop/celular foram inspecionadas.

Reinício real isolado: sessão, cinco mensagens, um rascunho, dois chamados existentes, estado `HUMAN_ACTIVE` e responsável preservados. O teste reiniciou API, agente e web, sem remover o volume.

Três chamadas reais com `google/gemini-3.8-flash` passaram, sem credenciais na saída:

| Cenário | Resultado | Entrada/saída | Duração na API |
| --- | --- | --- | --- |
| Horário | Orientação com fonte `hours` aplicável | 852 / 349 tokens | 6,942 s |
| Fora de TI | Redirecionamento, sem rascunho | 364 / 336 tokens | 4,304 s |
| Crítico | Transferência por regra de criticidade e pausa persistida | 1.208 / 1.185 tokens | 15,666 s |

São amostras limitadas, sem alegação de benchmark, acerto universal ou estimativa monetária. Os testes automatizados de regressão usam stub e não consomem o Gemini. Build de produção, tipagem estrita, formatação e busca de segredos também foram executados.

## Entrega inicial de 27/10/2026

Execução local em 27/10/2026, com PostgreSQL 18 em Docker. CI e PRs fornecem o registro verificável da validação remota.

| Verificação | Evidência |
| --- | --- |
| TypeScript estrito | `npm run typecheck` em frontend e agente |
| Build de produção | `npm run build` e build Linux dos containers |
| API/domínio | 33 testes PostgreSQL, incluindo schemas isolados e migration upgrade/downgrade |
| Agente offline | 2 testes de contrato/intenção e preservação de desconhecidos |
| Navegador | 2 jornadas completas: confirmar chamado e atendimento funcionário/analista |
| Gemini real | Uma consulta de horário no modo live retornou intenção help, fonte hours e decisão válida |
| Uso no smoke real | 2.754 tokens de entrada, 423 de saída e aproximadamente 8,8s; medição de uma chamada, não benchmark |
| Reinício real | API, agente e web reiniciados; 5 mensagens, 1 rascunho, sessão e proprietário humano preservados |
| Visual | Login, histórico e decisões inspecionados no Chrome; fontes locais e layout extraídos do protótipo |

Testes relevantes: protocolo/conversa/rascunho alheios; origem externa; logout; confirmação repetida; revisão antiga; falha após commit; reabertura dentro/fora da janela; complemento sem zerar atraso; limite do agente sem bloquear humano; geração cancelada por handoff; dois analistas disputando simultaneamente; suporte humano durante indisponibilidade; retentativas do legado sem repetir o LLM.

O modo live foi validado com chave local, sem publicá-la ou registrar seu valor. A rotina CI usa stub, sem custo de provedor. O conjunto não prova acerto universal do modelo; mais cenários reais e calibragem da confiança são evoluções.

Não houve deploy público da aplicação. O repositório é público e o Compose expõe a aplicação somente em localhost. A API Python continua sendo uma exceção explícita ao requisito de linguagem do enunciado.
