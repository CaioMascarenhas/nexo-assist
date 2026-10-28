# Modelo de dados e contratos propostos

Este é um desenho para implementação, não um schema já migrado. PostgreSQL é a fonte de verdade. Guardar datas em `timestamptz` e apresentar no fuso configurado. IDs internos UUID; protocolo legível de chamado é separado.

## Propriedade dos dados

| Schema | Proprietário | Conteúdo |
| --- | --- | --- |
| `app` | Módulos de aplicação no servidor Next.js | Usuários, sessões, conversas, mensagens, decisões, rascunhos, artigos, execuções e eventos |
| `tickets` | Módulo de chamados no servidor Next.js | Chamados, atualizações, transferências, ciclos de SLA e operações idempotentes |
| `mastra` | Storage oficial | Dados internos de execução/memória usados pelo framework |

Uma instância local atende os schemas, com uma conexão de aplicação e storage Mastra configurado separadamente. A fronteira é de código: somente o repositório do módulo de chamados manipula suas tabelas; o agente recebe a fachada autorizada `TicketService`. Essa separação não é uma fronteira física de segurança. FKs entre dados da mesma aplicação podem ser usadas; não há necessidade de desenhar identidades como se já existissem microsserviços.

As tabelas de mensagens de domínio são o histórico canônico mostrado ao usuário. Se memória Mastra for habilitada, seus registros são projeções com IDs correspondentes; não manter dois históricos independentes que possam divergir.

## Entidades

| Entidade | Campos essenciais e restrições |
| --- | --- |
| `users` | `id`, `name`, `email` único normalizado, `role` EMPLOYEE/ANALYST, `department`, `supportLevel`, `active`; sem senha do login demonstrativo |
| `sessions` | Token opaco armazenado por hash, usuário, expiração, criação, revogação; nunca sessão só em memória |
| `conversations` | Dono funcionário, estado, analista atual, chamado selecionado, `stateVersion`, `generationEpoch`, resumo, fatos confirmados, datas de transferência/encerramento |
| `chat_sessions` | Conversa, contador de turnos, limite 30, início e término; separada da sessão de autenticação |
| `messages` | Conversa, autor USER/AGENT/ANALYST/SYSTEM, texto/conteúdo estruturado, status, sequência, `clientMessageId`, execução/decisão relacionadas |
| `decision_records` | Turno, intenção, fatos, campos faltantes, confiança/origem, regras, evidências, ação, justificativa curta, modelo/prompt, uso e duração |
| `tool_executions` | Decisão, ferramenta, argumentos saneados, resultado resumido, status, tentativa, tempo e erro tipado |
| `ticket_drafts` | Conversa/dono, operação CREATE/UPDATE/REOPEN, alvo/versão, payload, revisão, estado PENDING/PROCESSING/COMMITTED/CANCELLED/EXPIRED/INVALIDATED, resultado |
| `handoffs` | Conversa, motivo USER_REQUEST/CRITICAL/OVERDUE/LOW_CONFIDENCE, resumo, nível N1/N2 proposto, autor e datas |
| `knowledge_articles` | Título, corpo, categoria, tags, sistemas aplicáveis, restrições, versão, ativo e índice de busca |
| `agent_runs` | Conversa, mensagem de entrada, estado, lease, epoch, tentativas, erro e resultado; chave única de deduplicação, sem fila externa |
| `pending_operations` | Efeito simulado ainda não concluído, alvo, payload aprovado, chave idempotente, tentativas e estado; retentativa explícita após esgotar limite |
| `conversation_events` | Sequência monotônica, conversa, evento, payload autorizado e data; base de replay SSE |
| `tickets` | UUID, protocolo único, solicitante, título, descrição, INC/REQ, categoria, prioridade, afetados, impacto/urgência, status, fila, versão, criação/resolução |
| `ticket_updates` | Chamado, autor/tipo, conteúdo, se qualifica como atualização de suporte, timestamp e correlação |
| `ticket_sla_cycles` | Chamado, âncora, motivo, prioridade/calendário versionados, vencimento, conclusão; histórico de prazos |
| `ticket_transfers` | Chamado, fila anterior/destino, motivo, resumo e correlação; não é a propriedade da conversa |
| `idempotency_operations` | Chave única por ator/escopo, hash do payload, resultado e entidade; commit junto da mutação |

`agent_runs` registra execuções feitas durante a requisição; não é um sistema de filas. `pending_operations` pode começar como estado no rascunho ou transferência existente e só virar tabela própria se necessário. Não criar worker/outbox na primeira entrega.

Status de chamado propostos: OPEN, WAITING_ANALYST, IN_PROGRESS, APPROVED, RESOLVED e CLOSED. Status de conversa: AGENT_ACTIVE, WAITING_ANALYST, HUMAN_ACTIVE e CLOSED. Estado visual “vencido” é calculado, não substitui o status do chamado. “Aprovado” ainda pode estar aberto para acompanhamento.

## Invariantes e índices

- `CHECK`/enum para tipos, categorias, prioridades e estados; não usar valores livres do modelo.
- `HUMAN_ACTIVE` exige analista; `AGENT_ACTIVE` não pode conservar proprietário humano ativo.
- `UNIQUE(conversation_id, sequence)` e `UNIQUE(conversation_id, client_message_id)` para mensagens.
- Uma operação de confirmação por rascunho/revisão; repetir a mesma retorna o resultado anterior.
- Uma execução de agente ativa por conversa; lease durável com epoch impede publicação por handler antigo.
- Índices em conversas por dono/data e estado/analista; chamados por solicitante/status e resolução; execuções por conversa/estado; eventos por conversa/sequência.
- Protocolo gerado por sequência/contador transacional, não por `count()+1`.
- Índices de busca textual e, se usado, GIN de trigramas para artigos/títulos. Sempre filtrar proprietário antes de expor candidatos de chamados.
- Chamar o serviço local com simulação de falha após commit ainda pode deixar efeito incerto: usar PROCESSING, idempotência e reconciliação para fechar o rascunho após retentativa. Operações puramente locais sem essa simulação podem compartilhar uma transação, sem rede ou transação distribuída.

## Autenticação e fronteira de confiança

Login demonstrativo aceita apenas e-mails existentes no seed e qualquer senha não vazia, conforme o PRD. Perfis ANALYST também vêm do seed; papel nunca vem de campo enviado pelo browser. Cookie de sessão `HttpOnly`, `SameSite=Lax`, `Secure` sob HTTPS; expiração e revogação no banco.

Mutação exige mesma origem e proteção CSRF compatível com a sessão. Validar autorização em cada endpoint e conexão SSE, não só na navegação. Não registrar o campo senha e não transmiti-lo ao LLM.

Route Handlers autenticam a sessão e constroem `ActorContext` no servidor. Esse contexto é fornecido à fachada de chamados fora dos argumentos controlados pelo modelo; cada operação aplica autorização por recurso. Não existe chamada HTTP interna nem necessidade de HMAC entre módulos do mesmo processo. Não aceitar identidade ou papel livre do browser/modelo.

Na implantação local, expor apenas o Next.js e opcionalmente PostgreSQL em localhost para desenvolvimento. Dados de trace, mensagem e SSE recebem o mesmo filtro de privacidade dos chamados. Uma futura extração para outro processo exigirá autenticação entre serviços, fora do escopo inicial.

## API pública do BFF

Contratos JSON com schemas Zod compartilhados. Prefixo sugerido `/api/v1`. Identidade sempre deriva da sessão.

| Método e rota | Responsabilidade |
| --- | --- |
| `POST /auth/login` | `{email, password, rememberMe?}`; estabelecer sessão |
| `POST /auth/logout` | Revogar sessão |
| `GET /me` | Dados seguros do usuário e papel |
| `GET /conversations` | Conversas do funcionário; suporte usa rota própria |
| `POST /conversations` | Criar conversa/sessão inicial respeitando limite de uso |
| `GET /conversations/:id` | Estado, resumo e paginação de histórico |
| `POST /conversations/:id/messages` | `{clientMessageId, content, chatSessionId}`; persistir e executar turno transmitindo eventos na resposta; em estado humano, apenas persistir mensagem |
| `GET /conversations/:id/events?after=...` | SSE autenticado; replay de eventos persistidos |
| `POST /conversations/:id/chat-sessions` | Nova cota de conversa sem apagar histórico, sujeita a rate limit |
| `GET /tickets` e `GET /tickets/:id` | Proxy autorizado para chamados do funcionário |
| `POST /drafts/:id/confirm` | `{revision, confirmationId}`; executar/reconciliar exatamente o rascunho aprovado |
| `PATCH /drafts/:id` | Editar dados e incrementar revisão; recalcular regras e exigir nova confirmação |
| `POST /drafts/:id/cancel` | Invalidar rascunho pendente sem alterar chamado |
| `POST /conversations/:id/handoff` | Pedir humano e persistir pausa/resumo |
| `POST /conversations/:id/runs/:runId/retry` | Retomar execução interrompida após revalidar estado/lease, sem cobrar novo turno nem repetir efeito já concluído |
| `POST /conversations/:id/operations/:operationId/retry` | Retentar efeito pendente autorizado, preservando chave de idempotência e aprovação |
| `GET /analyst/conversations` | Busca e filtros; acesso ANALYST |
| `GET /analyst/conversations/:id` | Histórico e contexto autorizado do atendimento |
| `GET /analyst/conversations/:id/tickets` | Chamados do funcionário dessa conversa |
| `POST /analyst/conversations/:id/claim` | Assunção atômica com `expectedStateVersion` |
| `POST /analyst/conversations/:id/messages` | Mensagem do analista atual, sem execução do agente |
| `POST /analyst/conversations/:id/release` | Devolver com nota/resumo e versão esperada |
| `POST /analyst/conversations/:id/close` | Encerrar atendimento, mantendo chamado independente |
| `GET /health/live` e `GET /health/ready` | Processo vivo e dependências necessárias prontas |

Uma rota de cancelamento da resposta poderá ser adicionada se fizer parte da UX final. Não expor endpoint genérico para o cliente executar ferramentas arbitrárias.

Erros: `{error: {code, message, retryable, correlationId}}`. Usar 401 sem sessão, 403 para papel não autorizado, 404 genérico para recurso alheio/inexistente, 409 para estado/versão conflitante, 422 para dados inválidos, 429 para limite e 503 para dependência temporariamente indisponível. Não revelar se o protocolo de terceiro existe.

## Contrato interno de chamados

Interface TypeScript `TicketService`, executada dentro do Next.js. Cada método recebe contexto de ator confiável criado no servidor; argumentos de negócio e resultados são validados. Ferramentas do agente usam apenas os métodos de leitura/preparação autorizados; comandos de escrita partem da confirmação no serviço de aplicação.

| Método | Contrato |
| --- | --- |
| `listTickets(context, filters)` | Filtros, paginação e solicitante autorizado |
| `getTicket(context, id)` | Snapshot autorizado, versão e SLA |
| `createTicket(context, command)` | Payload aprovado + chave idempotente; solicitante do contexto |
| `addTicketUpdate(context, command)` | Complemento aprovado, versão esperada e chave idempotente |
| `reopenTicket(context, command)` | Motivo, elegibilidade, aprovação verificada, versão e chave |
| `transferTicket(context, command)` | Fila/motivo/resumo, versão e chave; não assume conversa |
| `getOperation(context, key)` | Resultado autorizado de operação de efeito incerto |

`simulator.ts` envolve a implementação persistente desse contrato e pode introduzir latência, indisponibilidade e timeout após commit, conforme cenário de teste. Erros tipados são traduzidos para status HTTP somente na borda pública do Next.js. Não precisamos criar rotas internas só para o agente fazer HTTP contra o próprio servidor.

Para transferência sem chamado existente, a fila humana funciona apenas com a conversa; não criar chamado oculto para satisfazer uma FK. Se o chamado for criado depois, associá-lo por operação confirmada.

## Streaming e recuperação

Eventos propostos: `message.accepted`, `action.started`, `action.completed`, `decision.available`, `message.delta`, `message.completed`, `ticket.selection`, `draft.ready`, `ticket.updated`, `handoff.created`, `conversation.state.changed`, `analyst.message` e `operation.error`.

Cada evento persistente tem ID, conversa, execução, tipo, sequência e timestamp. Cliente deduplica por ID e reconecta com `Last-Event-ID` ou cursor `after`. Mensagens podem ser reconstruídas do banco. Deltas de texto podem ser transitórios; persistir final e estado parcial de forma limitada. Em restart, sinalizar geração interrompida e oferecer retomada explícita com o mesmo ID, sem fabricar conclusão. Não manter transação/lock de banco aberto durante a chamada ao LLM; usar lease renovável e epoch.

Proposta simples local: o POST de mensagem executa o agente e transmite a resposta enquanto a requisição está ativa. A rota SSE acompanha tabela de eventos com polling curto e heartbeat para replay, estado e mensagens humanas, somente com consumidores conectados. Não inicia trabalho essencial após a resposta HTTP. Evolução possível para worker apenas se exigirmos recuperação automática independente de requisições.

## Dados de demonstração

Criar seeds idempotentes com referência temporal calculada a partir de um relógio injetável. O seed inicial escolhe `SEED_NOW`; testes fixam data. Seed de startup não reescreve mensagens e chamados existentes.

| Conjunto | Cobertura proposta |
| --- | --- |
| Funcionários | Ana Souza, Carla Mendes e Bruno Tavares, todos fictícios; cada um com e-mail `@nexo.com.br` |
| Analistas | Um N1 e um N2; permitir testar corrida com dois logins |
| 8 artigos | VPN 809/Windows 10; service desk/plantão; desbloqueio SAP; diagnóstico notebook; solicitação monitor; Outlook; instalação software; acesso SharePoint |
| Chamados da Ana | Notebook vencido, acesso em andamento, monitor aprovado, SAP resolvido há 4 dias, outro resolvido há mais de 7 dias |
| Chamados de terceiros | Título igual/parecido ao da Ana para teste de privacidade |
| Cenários adicionais | Falha coletiva crítica, dúvida resolvida por artigo, baixa confiança, indisponibilidade e timeout após commit |

Os protocolos do protótipo podem ser reutilizados como dados ilustrativos, mas as datas de SLA devem ser calculadas. Não copiar um “há 5 dias” estático e esperar que continue correto na avaliação.
