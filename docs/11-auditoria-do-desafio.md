# Auditoria do desafio e das jornadas

Revisão de 28/10/2026. Fontes locais: PDF original de cinco páginas, arquivo original do protótipo indicado em `telas.txt`, inventário sanitizado e observações de `problemasaresolver.md`. Os arquivos originais do processo seletivo continuam locais.

## Problemas e rastreabilidade

Cada defeito foi registrado antes da correção, com branch, commits progressivos e PR. As dependências entre PRs foram explicitadas pela branch de destino; a integração em `main` exige os três checks obrigatórios, sem ignorar a proteção.

| Problema | Issue | PR |
| --- | --- | --- |
| Português nos detalhes da decisão e acentos na documentação | [19](https://github.com/CaioMascarenhas/nexo-assist/issues/19) | [23](https://github.com/CaioMascarenhas/nexo-assist/pull/23) |
| Avatares, autoria e presença simulada no console | [20](https://github.com/CaioMascarenhas/nexo-assist/issues/20) | [24](https://github.com/CaioMascarenhas/nexo-assist/pull/24) |
| Chat amplo, textos maiores, histórico compacto e painéis no celular | [21](https://github.com/CaioMascarenhas/nexo-assist/issues/21) | [25](https://github.com/CaioMascarenhas/nexo-assist/pull/25) |
| Protocolo digitado, troca de seleção e consulta de resolvidos | [26](https://github.com/CaioMascarenhas/nexo-assist/issues/26) | [30](https://github.com/CaioMascarenhas/nexo-assist/pull/30) |
| Continuidade depois de tentar a orientação de VPN | [27](https://github.com/CaioMascarenhas/nexo-assist/issues/27) | [31](https://github.com/CaioMascarenhas/nexo-assist/pull/31) |
| Stream e resultados de busca fora de ordem | [28](https://github.com/CaioMascarenhas/nexo-assist/issues/28) | [32](https://github.com/CaioMascarenhas/nexo-assist/pull/32) |
| Revisões vazias, título ignorado, protocolo e expiração do rascunho | [29](https://github.com/CaioMascarenhas/nexo-assist/issues/29) | [33](https://github.com/CaioMascarenhas/nexo-assist/pull/33) |
| Prioridade/impacto do complemento e transferência por vencimento | [34](https://github.com/CaioMascarenhas/nexo-assist/issues/34) | [35](https://github.com/CaioMascarenhas/nexo-assist/pull/35) |
| Cartão histórico enviando mensagem involuntária pelo analista | [36](https://github.com/CaioMascarenhas/nexo-assist/issues/36) | [37](https://github.com/CaioMascarenhas/nexo-assist/pull/37) |
| Duplicidade depois de resumir o título na revisão | [38](https://github.com/CaioMascarenhas/nexo-assist/issues/38) | [39](https://github.com/CaioMascarenhas/nexo-assist/pull/39) |
| Resumo humano sem códigos internos e contagens legíveis | [40](https://github.com/CaioMascarenhas/nexo-assist/issues/40) | [41](https://github.com/CaioMascarenhas/nexo-assist/pull/41) |

A [issue 22](https://github.com/CaioMascarenhas/nexo-assist/issues/22) reúne a auditoria, os testes ampliados e este registro. A issue histórica 17 também teve o título traduzido; commits publicados anteriormente foram preservados.

## Aderência ao PDF

| Requisito | Implementação e verificação |
| --- | --- |
| Login com funcionários de exemplo e senha arbitrária | E-mail conhecido, senha não vazia, perfil, saída e expiração; testes de API e navegador |
| Chat com respostas, cartões, seleção e opções rápidas | Jornadas de dúvida, protocolo, lista com um ou vários chamados, abertos/resolvidos, coleta progressiva e rascunho |
| Limite de 30 mensagens | Turnos do funcionário persistidos, bloqueio do agente e continuidade do canal humano; teste PostgreSQL |
| Agent Mastra ou LangGraph.js | Mastra em TypeScript estrito, decisão estruturada, ferramentas somente de leitura e Gemini configurável |
| Serviço de chamados separado do agente | `TicketService` na API; o agente não importa banco nem executa escritas |
| Confirmação antes de criar/atualizar | Revisão vinculada a usuário/conversa, edição, cancelamento, expiração, confirmação idempotente e teste concorrente |
| Campos obrigatórios, tipos e categorias | Coleta de fatos e validação independente do modelo; quatro níveis de prioridade cobertos |
| Não duplicar e reabrir em até sete dias | Similaridade normalizada, palavras significativas e preferência por abertos; confirmação dentro/fora da janela, sem conhecer chamados alheios |
| Transferência por pedido, criticidade, vencimento ou insegurança | Cenários dedicados; resumo persistido e pausa também enquanto aguarda analista |
| Console com filtros, histórico e chamados | Fila, assistente, minhas, busca, contexto do funcionário, assumir, responder, devolver e encerrar; testes com duas sessões |
| Decisões fáceis de entender | Ações, intenção, fatos, regras, fontes/aplicabilidade, confiança estimada, tokens e duração; rótulos em português |
| Retomada após reinício | Reinício real de API/agente/web preservando sessão, mensagens, rascunho, chamados e responsável humano |
| Erros do legado | Retentativas de leitura sem repetir o LLM, falha após commit, idempotência e atendimento humano disponível |
| Segurança e privacidade | Cookie HttpOnly, sessão opaca, autorização por dono/analista, origem validada, segredo interno e teste de ausência de chaves no Git/bundle |
| Execução e documentação | Compose, migration/seed, `.env.example`, instalação documentada e script de testes isolado |
| TypeScript em todo o sistema | **Exceção explícita:** API Python/FastAPI, solicitada pelo autor. Frontend e agente usam TypeScript estrito. Esta divergência técnica permanece; não é apresentada como requisito integralmente atendido |
| Deploy | Diferencial opcional, não realizado; execução local e repositório público |

## Comparação com as telas

Foram confrontados os seis frames do `.pen` com as capturas da aplicação. O inventário registra as medidas/fontes originais. As capturas da aplicação foram inspecionadas após execução das jornadas; isso não constitui comparação automática pixel a pixel. O acesso interativo ao site do protótipo estava indisponível nesta sessão, por isso a revisão da referência usou o original já salvo.

| Referência | Verificação e ajuste |
| --- | --- |
| Identificação | Painel escuro, apresentação, formulário, demonstração e fontes locais Newsreader/Schibsted |
| Novo chamado | Ações acima da resposta, opções rápidas, rascunho completo, prioridade/prazo e confirmar/editar/cancelar |
| Consulta | Seleção, cartão, status, vencimento, complemento e transferência com contexto |
| Console aguardando | Lista/filtros, avatar/nome, presença ilustrativa, resumo, campo bloqueado e assumir/devolver |
| Console humano | Nome/avatar de ambos os autores, assistente pausado, resposta, devolução e encerramento |
| Perfil complementar | Nome/e-mail somente leitura e aviso de autenticação demonstrativa |

A pedido do autor, o chat ocupa a largura disponível, os textos foram ampliados e a retomada de atendimentos fica recolhida em um seletor com rolagem. Em 1920, 1366 e 390 px foram verificados largura útil, ausência de rolagem horizontal e acesso ao campo de mensagem. No celular o console oferece painéis de conversas e chamados, em vez de escondê-los permanentemente.

Presença é simulada e identificada por texto e cor: Carla representa offline; as outras contas, online. Ela não mede conexão real e não controla a possibilidade de atendimento.

As seis capturas são geradas em `tmp/screenshots/tela-*.png`. Os testes também geram capturas das resoluções verificadas; falhas produzem screenshot e trace em `test-results/`.

## Diferenças deliberadas e limites

- O Anexo A exige transferência por vencimento; ele prevalece sobre a oferta opcional do desenho.
- Redefinição de senha, contadores ilustrativos de desempenho/não lidas e promessa de acesso remoto do protótipo não viraram integrações fictícias. O perfil informa a autenticação de demonstração. Não há recuperação real por e-mail nem controle remoto.
- Não há roteamento automático N1/N2 definido pelo enunciado: ambos os analistas podem ver a fila, com propriedade exclusiva após assumir.
- O stream apresenta atividade durante a execução e blocos do texto após validar a decisão; não transmite cada token nativo do Gemini.
- Duplicidade ainda é uma heurística, com casos positivos e negativos cobertos; não existe garantia de equivalência semântica universal.
- O calendário útil considera as premissas documentadas, sem feriados. O prazo mostrado é de resposta/atualização do suporte.
- As jornadas automatizadas usam o agente de demonstração. Os cenários reais têm orçamento limitado e não medem acerto universal, custo monetário ou confiança calibrada.

## Repetir a verificação

Instale as dependências conforme o README e execute:

```powershell
npm run typecheck
npm run format:check
npm run test:agent
.\.venv\Scripts\python.exe -m pytest apps/api/tests -q
npm run build
.\.venv\Scripts\python.exe scripts/test-e2e.py --reset
.\.venv\Scripts\python.exe scripts/verify-persistence.py --isolated
.\.venv\Scripts\python.exe scripts/verify-no-secrets.py
```

O reset remove **somente** o volume descartável `nexo-revisao_nexo-data`. A aplicação de uso normal usa outro projeto e outro volume. As jornadas isoladas usam portas 3100/8100/55432, modo stub e chave vazia; não consomem o provedor pago. Não troque de branch enquanto a bateria estiver em execução.

Com a aplicação normal em modo real, `scripts/evaluate-live.py` executa somente três cenários: horário com fonte aplicável, redirecionamento fora de TI e criticidade com transferência. Esta rotina consome o Gemini configurado e mantém as credenciais fora da saída.
