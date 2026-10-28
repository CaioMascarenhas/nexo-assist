# Telas e experiência

## Referência examinada

O [protótipo compartilhado](https://app.pen.dev/s/swhm7Xfy1krKDIc-QyqE9J8ZI2xFB0qbNvHIncCXcLg) foi aberto visualmente no navegador. Também foi baixado o arquivo original `nexo.pen`, cujo conteúdo foi lido para extrair textos, tokens e medidas. O download veio como `nexo.zip`; o `.pen` foi preservado em `referencias/`.

O canvas contém **seis frames desktop**. Cinco correspondem ao Anexo C e um é a página de perfil. Não há frame mobile no arquivo examinado. O arquivo descreve composição visual; isso não comprova que os botões representam fluxos navegáveis implementados.

| Tela | ID no `.pen` | Dimensão original | Rota proposta |
| --- | --- | --- | --- |
| Identificação | `bi8Au` | 1440 x 900 | `/login` |
| Chat - Novo chamado | `IcuoM` | 1440 x 900 | `/chat/:conversationId` |
| Chat - Consulta e transferência | `vbsNW` | 1440 x 900 | Mesma rota, outro estado |
| Atendente - Conversas | `x2HBOE` | 1440 x 900 | `/analyst/conversations/:id` |
| Atendente - Atendimento assumido | `CAqx8` | 1567 x 900 | Mesma rota, estado humano |
| Cliente - Meu perfil | `i4fCbC` | 1440 x 900 | `/profile`, complementar |

O [inventário extraído](referencias/inventario-prototipo.json) contém o texto de cada nó, fonte, tamanho, medidas das regiões principais e todas as variáveis do arquivo. Usá-lo durante implementação para evitar recriar a referência de memória.

## Tela 1: identificação

Composição: painel de apresentação escuro de 800 px; restante branco para login. Apresentação com título serifado, descrição, exemplo de chat e indicadores ilustrativos. Formulário com e-mail, senha, manter conectado e botão Entrar. Rodapé com privacidade e contato de suporte.

- Validar e-mail de exemplo e senha não vazia; aceitar qualquer valor da senha, como pede o PRD.
- Exibir carregamento, e-mail desconhecido, indisponibilidade e sessão expirada.
- Identificar que é ambiente demonstrativo. Nunca sugerir ao avaliador usar senha corporativa real.
- “Esqueci minha senha”, “Privacidade e uso de dados” e contato podem abrir informações locais. Recuperação real de senha e envio de e-mail ficam fora do escopo.
- Os números “8 s”, “72%” e “6 analistas online” são dados ilustrativos, não métricas coletadas. Se mantidos, indicar demonstração; não apresentá-los como telemetria real.

## Telas 2/3: atendimento do funcionário

Sidebar de 232 px, logo, Atendimento, Meu perfil e identificação do usuário no rodapé. Área principal com breadcrumb, indicador do atendimento, histórico, compositor fixo e contador `18/30 mensagens nesta sessão`.

Fluxo de abertura representado:

1. Funcionário relata VPN com erro 809.
2. Agente mostra ações “consultou seus chamados” e “buscou na central de ajuda”.
3. Resposta informa restrição do artigo para Windows 10 e pergunta afetados com Só eu / Minha equipe / Toda a empresa / Não sei.
4. Funcionário informa reunião hoje; agente calcula prioridade e SLA e monta rascunho.
5. Card tem título, descrição, categoria, prioridade/prazo, afetados e Confirmar / Editar / Cancelar.

A referência presume Windows 11 conhecido; o produto precisa obtê-lo por contexto confirmado ou pergunta. O protótipo não elimina essa coleta.

Fluxo de consulta representado:

1. Pedido sem número: “Qual o status do meu chamado?”.
2. Lista selecionável com três protocolos, títulos e status.
3. Seleção abre card detalhado: descrição, categoria, prioridade, abertura, última atualização e vencimento.
4. Ações: Falar com um analista / Adicionar informação / Não, obrigado.

Para o MVP adotar a regra do Anexo A de transferência por vencimento, registrando a divergência com a oferta opcional do protótipo em D-04. A estrutura visual do card permanece; o texto/estado deve refletir o comportamento implementado.

Componentes sugeridos: `EmployeeShell`, `ChatTimeline`, `MessageBubble`, `AgentActionChips`, `DecisionDetails`, `TicketSelection`, `TicketCard`, `TicketDraftCard`, `QuickReplies`, `MessageComposer`, `MessageBudget` e `HandoffBanner`.

O detalhe da decisão pode ser um painel expansível por resposta. Manter intenção, regras, evidências, confiança e resultado de ferramentas em linguagem legível. Não despejar JSON bruto como interface principal.

## Telas 4/5: console do analista

Quatro regiões: rail de 64 px; lista de conversas de 380 px; conversa flexível; painel de chamados de 340 px. Fundo da conversa `#EEF1F5`. O segundo frame tem largura maior, portanto não forçar todos os frames a 1440 px.

Lista: busca por conversa/chamado, filtros Todas / Para você / Com o agent / Minhas, avatares, prévia da última mensagem, horário, não lidas e estado. Definição proposta: Para você = fila compatível com N1/N2 e sem proprietário; Com o agent = AGENT_ACTIVE; Minhas = HUMAN_ACTIVE do analista logado. Contadores devem vir das mesmas consultas dos filtros.

Conversa aguardando:

- Cabeçalho com funcionário e estado “Aguardando atendente”.
- Histórico do funcionário e do agente, com eventos de transferência.
- Resumo do caso acessível sem precisar reler tudo.
- Banner “Agent pausado”; ações Assumir atendimento e Devolver ao agent.
- Compositor desabilitado com “Assuma o atendimento para responder”.

Conversa assumida:

- Evento identificando quem assumiu e agente pausado.
- Compositor liberado apenas ao analista proprietário.
- Devolver ao agent e Encerrar atendimento.
- Mensagens humanas identificadas e transmitidas ao funcionário.

Painel direito: chamado desta conversa e demais chamados do funcionário, abertos e resolvidos. O vínculo é da conversa selecionada; trocar de conversa atualiza e limpa dados anteriores para impedir vazamento visual.

Texto “vou iniciar acesso remoto” pertence ao exemplo de conversa. Não precisamos implementar controle remoto. “Agent pausado até 12:05” e contato em 2h não definem uma regra de retorno automático ou novo SLA.

## Perfil complementar

Nome e e-mail gerenciados pela TI; senha e botão de redefinição aparecem no frame adicional. Proposta: entregar página somente leitura com aviso de autenticação demonstrativa. Não mostrar “alterada há 42 dias” como fato real nem enviar e-mail de redefinição. Isso completa a navegação sem construir um sistema de identidade fora do desafio.

## Design tokens observados

| Uso | Valor no arquivo |
| --- | --- |
| Títulos de apresentação/login | Newsreader (`$font-display`) |
| Texto e controles efetivamente usados | Schibsted Grotesk (`$font-ui`) |
| Branco | `$paper`: `#FFFFFF` |
| Superfície cinza | `$desk`: `#F6F7F9` |
| Painel escuro/texto principal | `$ink`: `#1B2431` |
| Texto secundário | `$ink-2`: `#3D4656`; `$ink-3`: `#5B6472` |
| Divisores | `$rule`: `#E6E8EC` |
| Ação principal | `$cta`: `#0062C4` |
| Outros tokens primários | `$primary`: `#0285F7`, `$success`: `#00BD6C`, `$warning`: `#F5A500`, `$danger`: `#EE343B` |
| Raios definidos | 6, 10 e 14 px |

O arquivo também declara Geist, Geist Mono e IBM Plex Mono, mas os nós de texto examinados usam `$font-ui` e `$font-display`. Não escolher Geist apenas por ser o padrão de um template Next.js.

Tamanhos observados: apresentação 54 px; Entrar 40 px; títulos de card 18 px; mensagens 14,5 px; labels/ações em torno de 12,5-13,5 px. Converter em tokens CSS coerentes e ajustar pela comparação visual.

## Estados e acessibilidade

Cobrir: conversa inicial; retomada; busca/carregamento; resposta em streaming; nenhuma correspondência; vários chamados; artigo incompatível; rascunho pendente/editado/cancelado/expirado; confirmação em processamento; falha do legado; transferência pendente de sincronização; fila humana; atendimento humano; encerrada; limite atingido; desconexão SSE; sessão expirada.

No limite, bloquear novos turnos do agente e oferecer nova sessão sujeita a rate limit ou humano, preservando histórico. Confirmação de rascunho já apresentado não deve ficar impossível só porque foi o 30º turno.

Labels explícitos, foco visível, navegação por teclado, confirmação acessível, `aria-live` moderado para atualização final e ações sem depender só de cor. Atalhos: Enter envia, Shift+Enter quebra linha; Ctrl/Cmd+Enter confirma rascunho somente quando o foco/contexto for inequívoco.

A fidelidade principal é desktop. Para telas menores, proposta: sidebar recolhível, lista e painel do console em drawers, cards sem overflow horizontal. Não inventar uma exigência de design mobile presente no PRD.
