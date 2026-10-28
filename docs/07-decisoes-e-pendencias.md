# Decisões, ambiguidades e riscos

Este registro separa requisito do enunciado de escolha nossa. As premissas permitem começar; decisões de negócio podem ser revistas sem redesenhar o sistema.

## Decisões firmes

| ID | Decisão | Motivo |
| --- | --- | --- |
| A-01 | PostgreSQL, Docker e Next.js | Preferências explícitas do usuário |
| A-02 | TypeScript estrito | Obrigação do PRD |
| A-03 | Mastra como primeira opção | Preferência do PRD; integração documentada |
| A-04 | Serviço de chamados separado do agente | Obrigação do PRD; implementar por contrato/módulo dentro do Next.js, sem processo HTTP adicional |
| A-05 | Transparência e console no escopo principal | Exigências explícitas; transparência é destacada como parte mais importante |
| A-06 | Escritas controladas pelo servidor e confirmadas | Anexo A; reforçar no contrato, não só no prompt |
| A-07 | Entrega o mais breve possível, sem data fixa | Orientação do usuário; priorizar obrigatórios e adiar diferenciais |

Preferência de provedor atualizada: o usuário indicou que provavelmente usaremos Gemini porque possui créditos. Adotar Gemini como caminho principal; modelo, API/projeto e credenciais ainda precisam de validação técnica.

## Ambiguidades e tratamento proposto

| ID | Questão | Premissa inicial / impacto |
| --- | --- | --- |
| D-01 | O que são 30 mensagens por sessão? | Contar turnos do funcionário enviados ao agente, não respostas, tokens ou mensagens humanas. Persistir cota em `chat_sessions` |
| D-02 | O que encerra/renova uma sessão? | Nova sessão explícita ao atingir limite ou iniciar novo atendimento, preservando conversa e histórico. Rate limit impede renovação ilimitada para burlar custo |
| D-03 | Calendário, fuso e dias úteis | Seg-sex, 08-18, America/Fortaleza, sem feriados; dia útil = 10h de expediente. Horário vem de exemplo do Anexo B, não de definição completa de calendário |
| D-04 | Vencimento transfere automaticamente ou só oferece? | Anexo A diz que transferência acontece em vencidos; Tela 3 oferece escolha. Priorizar regra escrita e transferir após informar atraso. Se avaliador esclarecer que é opcional, política muda em um ponto e testes acompanham |
| D-05 | Sete dias para reabertura | Até 168h corridas inclusivas desde resolução; PRD não define se usa calendário ou horas úteis |
| D-06 | Qual atualização renova SLA? | Atualização substantiva do suporte; não mensagem do funcionário ou bot. Separar timestamps para não mascarar atraso |
| D-07 | Baixa segurança | Confiança do modelo é estimativa não calibrada. Perguntar quando houver lacuna simples; transferir se continuar inseguro. Limiar inicial 0,75 é heurística nossa |
| D-08 | Como analista faz login? | Usuários ANALYST no seed, mesmo login demonstrativo e role persistido; PRD define console, mas não autenticação própria do analista |
| D-09 | Privacidade vs console | Funcionários só veem seus chamados; analistas autenticados e autorizados veem contexto necessário no console, com auditoria |
| D-10 | Quando enviar para N1 ou N2? | N1 como padrão; N2 para escalonamento de chamado vencido/recorrente. Configuração proposta, não regra do Anexo A |
| D-11 | “Até 2h úteis” do protótipo | Não há esse SLA de transferência no Anexo A. Não prometer nem implementar retorno automático do agente por esse horário |
| D-12 | Perfil e redefinição de senha | Sexto frame não está entre as cinco telas do PRD. Perfil somente leitura é complementar; recuperação real de senha fora do MVP |
| D-13 | Encerrar conversa resolve chamado? | Não. Estados independentes; fechar atendimento não altera ticket sem comando explícito |
| D-14 | Reabertura é atualização? | Aplicar confirmação também à reabertura por ser mutação relevante; preservar protocolo |
| D-15 | Campo “tipo” ausente do card ilustrativo | Mostrar INC/REQ no rascunho para conferir todos os campos obrigatórios, mantendo estilo da tela |
| D-16 | Categoria “Hardware > Notebook” do protótipo | Categoria oficial permanece Hardware; subcategoria só metadado opcional, sem ampliar enum obrigatório |
| D-17 | Cadastro de equipamento/sistema operacional | Não foi fornecido inventário. Coletar na conversa quando necessário, em vez de inventar Windows 11 para todo usuário |
| D-18 | Afetados vs dono do chamado | Guardar escopo individual/equipe/empresa, quantidade quando informada e descrição; identidade do solicitante não muda pelo escopo |
| D-19 | Confirmação em atendimento humano | Regras de criação/atualização automática continuam protegidas; analista usa chat e ações de atendimento. Editor manual completo de tickets não é requisito do console |
| D-20 | Separação do serviço exige outra API/processo? | Interpretamos que separação lógica por contrato e módulo atende ao texto; o PDF não exige HTTP, Fastify ou microsserviços. Mock persistente e adapter de falhas dentro do Next.js reduzem o prazo |
| D-21 | É obrigatório continuar gerando resposta após reinício? | PRD exige dados/estado persistidos, não conclusão automática de turno interrompido. Registrar interrupção, preservar contexto e permitir retentativa idempotente por requisição; worker fica como evolução |

## Informações ainda necessárias

| Informação | Quando precisamos | Podemos avançar sem ela? |
| --- | --- | --- |
| Eventual data limite externa | Somente se surgir um prazo concreto além de “o mais breve possível” | Sim; urgência já definida e opcionais adiados |
| API/projeto onde os créditos Gemini são elegíveis e credencial local | Para validar execução real do LLM na etapa 0 | Domínio, UI e testes podem usar stub identificado; entrega real depende de acesso |
| Esclarecimento D-01/D-03/D-04/D-06 | Ideal antes da avaliação final | Sim, implementando e documentando premissas |
| Destino/acesso do GitHub | Antes de entregar repositório | Sim, desenvolvimento local independe |
| Hospedagem e limite de gasto | Apenas se houver deploy | Sim; deploy é diferencial opcional |

Nenhuma dessas informações exige inventar requisitos adicionais. Não é necessário esperar aprovação de cada biblioteca para iniciar a prova de integração.

## Riscos e mitigação

| Risco | Consequência | Mitigação |
| --- | --- | --- |
| Focar só no chat bonito | Falhar no que é mais valorizado | Entregar detalhe de decisão já no primeiro fluxo e reservar etapa obrigatória do console |
| Tudo ser decidido por prompt | Confirmação/privacidade/SLA inconsistentes | Regras determinísticas e validação por servidor |
| Modelo afirmar ação não executada | Perda de transparência | Chips gerados de eventos reais e resposta condicionada ao resultado de ferramenta |
| Publicação do agente após handoff | Atendimento duplo | Estado/epoch/lease persistidos, cancelamento e teste de corrida |
| Retry criar ticket duplicado | Violação de regra central | Idempotência no legado, chave estável e reconciliação de resultado incerto |
| Compatibilidade de versões | Perder tempo no meio do projeto | Spike antes dos fluxos; lockfile; não combinar exemplos Mastra v0/v1 ou Drizzle RC/estável |
| Calendário mal definido | Vencimento incorreto | Política configurável, relógio injetável, exemplos fixos e premissas no README |
| Histórico em memória | Perda de contexto/pausa em restart | PostgreSQL e teste real de reinício |
| Seed com datas absolutas | Demo deixa de mostrar atrasados corretamente | Referência temporal explícita e fixtures distintas de dados persistidos |
| Login demo público sem limites | Abuso e custo | Ambiente isolado, limites por sessão e globais; deploy só após controle de consumo |
| Escopo se expandir pelo protótipo | Gastar prazo com senha/presença/controle remoto | Separar elementos ilustrativos das obrigações do PDF |
| Docker Desktop parado | Não validar containers localmente | Iniciar daemon na implementação; não declarar Compose testado agora |

## Trade-offs aceitos

Uma aplicação Next.js com módulo de chamados separado por contrato reduz operação local. Essa separação é de responsabilidades; não oferece isolamento físico e precisa ser sustentada por imports restritos e testes. Execuções interrompidas são recuperadas explicitamente; não há worker/fila automática na primeira versão. Busca lexical/metadados é suficiente para avaliar a base curta inicialmente; embeddings ficam como melhoria baseada em evidência. Confiança é informativa e heurística, não garantia estatística. O login deliberadamente simplificado é adequado ao desafio com dados fictícios, não um sistema corporativo de produção.
