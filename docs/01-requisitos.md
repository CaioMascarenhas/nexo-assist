# Levantamento de requisitos

> Levantamento inicial: decisões de implementação foram atualizadas. Consulte o [README executável](../README.md) e o [ADR FastAPI](09-arquitetura-fastapi.md) para a arquitetura vigente.


## Fontes e classificação

Base: PRD v5, páginas 1 a 5; Anexo A na página 4; Anexo C na página 5; arquivo `referencias/nexo.pen`. O PRD define o comportamento obrigatório. O protótipo orienta layout e estilo; seus dados são ilustrativos. Conflitos e interpretações estão em [decisões e pendências](07-decisoes-e-pendencias.md).

- **Obrigatório:** escrito no PRD.
- **Decisão proposta:** interpretação ou implementação escolhida neste levantamento.
- **Complementar:** observado apenas no protótipo ou melhoria opcional.

O objetivo é reduzir triagem manual, resolver dúvidas sem fila, evitar chamados duplicados e entregar contexto suficiente ao analista. As métricas de sucesso são direcionadores; o PRD não estipula percentuais mínimos.

## Atores

| Ator | Capacidades |
| --- | --- |
| Funcionário | Entrar com e-mail de exemplo; conversar; consultar seus chamados; confirmar alterações; pedir atendimento humano; retomar conversa |
| Analista N1/N2 | Ver fila e histórico; assumir conversa; responder; consultar chamados do funcionário atendido; devolver ao agente; encerrar |
| Agente | Interpretar pedidos; recuperar evidências; propor ações; executar ferramentas autorizadas; registrar decisões; transferir |
| Serviço legado simulado | Consultar, criar, atualizar, reabrir e transferir chamados; persistir dados; apresentar falhas transitórias controladas |

A autorização do analista é uma exceção operacional necessária à privacidade do funcionário: somente perfis de suporte autorizados acessam o contexto no console. Isso não permite a um funcionário consultar chamados de colegas.

## Requisitos funcionais e aceite

Todos os itens RF abaixo são obrigatórios, exceto detalhes explicitamente marcados como decisão proposta.

| ID | Requisito e origem | Critério observável de aceite |
| --- | --- | --- |
| RF-01 | Login com e-mail corporativo e senha; aceitar funcionários de exemplo com qualquer senha. PRD p.2 | E-mail conhecido entra com senha não vazia arbitrária; desconhecido recebe erro; senha não é armazenada nem enviada ao LLM |
| RF-02 | Chat do funcionário e respostas em tempo real. PRD p.2 | Mensagem chega ao servidor; ações e resposta aparecem progressivamente; falha tem estado recuperável |
| RF-03 | Consultar central de ajuda para dúvidas. PRD p.1-2 | Responder com artigo aplicável, mostrar fonte e evitar abrir chamado desnecessário |
| RF-04 | Consultar chamados sem exigir número. PRD p.1 e Tela 3 | Listar apenas chamados do usuário; havendo ambiguidade, pedir seleção por card |
| RF-05 | Mostrar status e atraso. PRD p.1 e Anexo A | Card mostra protocolo, categoria, prioridade, status, atualização e prazo calculado; vencimento não é inferido apenas de texto relativo |
| RF-06 | Complementar chamado. PRD p.1 e Anexo A | Mostrar alteração proposta e só persistir após confirmação vinculada à versão do rascunho |
| RF-07 | Abrir chamado por conversa. PRD p.1-2 | Coletar título, descrição, tipo, categoria, prioridade e afetados; perguntar dados faltantes; confirmar antes de criar |
| RF-08 | Cards, opções rápidas e rascunho. PRD p.2 | Seleção envia dado estruturado; rascunho pode ser confirmado, editado ou cancelado; ações usadas ficam identificadas |
| RF-09 | Limite de 30 mensagens por sessão. PRD p.2 | Contador persistido e validado no servidor, inclusive entre abas; sem chamar modelo após o limite; sem travar atendimento humano já iniciado |
| RF-10 | Manter histórico e contexto. PRD p.1-2 | Logout/login e reinício preservam mensagens, rascunho pendente, chamado selecionado e estado da conversa |
| RF-11 | Consultar chamados existentes antes de criar e evitar duplicidade. Anexo A | Mesmo problema com chamado aberto gera proposta de atualização do existente, sem novo protocolo |
| RF-12 | Reabrir resolvido há até 7 dias. Anexo A | Propor reabertura quando elegível, confirmar e preservar protocolo/histórico; testar limite de 7 dias |
| RF-13 | Classificar INC/REQ e categorias oficiais. Anexo A | Incidente para falha; requisição para pedido; categoria pertence às seis permitidas |
| RF-14 | Calcular prioridade e SLA por impacto/urgência. Anexo A | Regras da tabela abaixo aplicadas por código; horário, vencimento e regra aparecem na auditoria |
| RF-15 | Transferir por pedido, criticidade, vencimento ou insegurança. Anexo A | Persistir motivo e resumo; aguardar atendente; não emitir novas respostas do agente; conflitos com oferta da Tela 3 estão registrados |
| RF-16 | Console com lista, filtros, status e histórico. PRD p.2, Telas 4/5 | Analista encontra conversa por busca/filtro e lê histórico completo autorizado, incluindo transferência |
| RF-17 | Assumir atendimento. PRD p.1-2 | Apenas um analista assume atomicamente; outro recebe conflito; agente continua pausado |
| RF-18 | Responder, devolver ao agente e encerrar. PRD p.1-2 | Mensagens do analista chegam ao funcionário; devolução permite próximo turno do agente; encerramento bloqueia novas mensagens nessa conversa |
| RF-19 | Painel de chamados do funcionário no console. PRD p.2 | Diferenciar chamado relacionado à conversa dos demais; mostrar abertos e resolvidos sem misturar funcionários |
| RF-20 | Mostrar ações acima de cada resposta. PRD p.2 | Chips correspondem a eventos reais: consulta, busca, classificação, SLA, rascunho, mutação, transferência ou erro |
| RF-21 | Detalhar entendimento, ação, segurança e motivo. PRD p.2 | Expansão legível por resposta mostra intenção, fatos relevantes, regras, evidências, confiança e resultado real de ferramentas |
| RF-22 | Restringir ao domínio de TI. Anexo A | RH/financeiro/facilities recebem orientação de redirecionamento, sem criação de chamado de TI |
| RF-23 | Preservar privacidade. Anexo A | Trocar ID no cliente, prompt ou URL não revela chamado/conversa de outro funcionário; mesma proteção em SSE e decisões |
| RF-24 | Serviço simulado separado do agente. PRD p.2 | Módulo de chamados com contrato próprio para consulta, criação, atualização e transferência; agente usa esse contrato, sem acessar seu repositório/SQL. API HTTP independente não é requisito do PDF |
| RF-25 | Dados próprios e variados. Anexo B | Alguns funcionários, 5-10 artigos, chamados abertos, vencidos, resolvidos recentemente e de terceiros; cenários reproduzíveis |

Decisão RF-09: contar mensagens do funcionário submetidas ao agente, incluindo opções rápidas que criam turno. Tokens, eventos de sistema e mensagens do analista não contam. Ações de confirmar/editar/cancelar rascunho são controles, não novos turnos de LLM. Essa interpretação precisa constar do README final.

## Regras de negócio

| ID | Regra |
| --- | --- |
| RN-01 | Tipos: `INC` e `REQ` |
| RN-02 | Categorias: Acesso, Rede e VPN, Hardware, Software, E-mail e Outros |
| RN-03 | Campos obrigatórios: título, descrição, tipo, categoria, prioridade e quem é afetado |
| RN-04 | Criação e atualização pelo agente dependem de confirmação do funcionário; adotar a mesma proteção para reabertura |
| RN-05 | Mesmo problema aberto: atualizar existente; resolvido em até 7 dias: pode reabrir após confirmação |
| RN-06 | Transferir com resumo, motivo e contexto; agente parado até devolução explícita |
| RN-07 | Funcionário só consulta chamados que abriu; o conjunto de afetados não concede acesso |
| RN-08 | Assuntos fora de TI são redirecionados |
| RN-09 | Prazo vale para primeira resposta e atualizações; existir mensagem automática não significa SLA cumprido |
| RN-10 | Conversa encerrada e chamado resolvido são estados distintos; encerrar chat não resolve chamado automaticamente |

RN-09 e RN-10 têm detalhes de implementação propostos em [estratégia do agente](03-agente-e-regras.md).

| Prioridade | Condição do PRD | Prazo obrigatório |
| --- | --- | --- |
| Crítica | Algo parado para equipe ou empresa | 1 hora |
| Alta | Uma pessoa impedida de trabalhar OU compromisso no mesmo dia | 4 horas úteis |
| Média | Atrapalha, mas existe alternativa | 3 dias úteis |
| Baixa | Pedido ou melhoria sem urgência | 5 dias úteis |

A urgência prevalece sobre a associação intuitiva entre REQ e prioridade baixa. Pedir acesso para trabalhar hoje pode ser REQ de prioridade alta. Identificar uma categoria não basta para decidir prioridade.

## Requisitos não funcionais

| ID | Exigência | Estratégia de verificação |
| --- | --- | --- |
| RNF-01 | TypeScript estrito | `strict: true`, verificação de tipos no CI; validar I/O em runtime |
| RNF-02 | Mastra preferencial ou LangGraph.js | Adotar Mastra; registrar por que e versões compatíveis |
| RNF-03 | Persistência após reinício | Teste real de restart preservando dados e propriedade do atendimento |
| RNF-04 | Poucos comandos e `.env.example` | Meta: copiar ambiente, preencher chave, `docker compose up --build`; migrations e seed automatizados |
| RNF-05 | Arquitetura clara | Dependências explícitas entre interface, agente, domínio e serviço de chamados |
| RNF-06 | Resiliência ao legado | Timeout, erro compreensível e retentativas limitadas; mutações idempotentes |
| RNF-07 | Eficiência e custo | Medir tempo, tokens e chamadas por turno; limitar loops/contexto; cálculo de custo com preço configurado |
| RNF-08 | Segredos e privacidade | Chaves só no servidor, cookies protegidos, autorização por recurso, logs sem credenciais |
| RNF-09 | UI fiel e estados de erro/carregamento | Comparar com frames originais; testar rascunho, fila humana, erro e limite de uso |
| RNF-10 | Qualidade e comunicação | Testes relevantes, commits incrementais e README que permita executar e explicar decisões |

Metas internas propostas, não impostas pelo PRD: exibir confirmação de recebimento/atividade em até 1 segundo em ambiente local; medir p50/p95 de resposta e tempo de ferramentas. Não prometer latência do provedor sem medição.

## Escopo da entrega

**Obrigatório:** todos os RF/RNF, cinco telas do Anexo C, dados de demonstração, repositório GitHub acessível, README completo e `.env.example`.

**Complementar:** página de perfil somente leitura para completar a navegação do protótipo; detalhes de presença/digitação e contadores decorativos se suportados por dados reais.

**Diferencial explícito:** deploy acessível e com limites de uso. Fazer depois do fluxo completo e dos testes de segurança.

**Fora do escopo inicial:** SSO real, integração real com ITSM, envio de e-mail de senha, acesso remoto à máquina, sistema de RH, aprovação real de compras, painel administrativo de artigos, anexos e múltiplas organizações. O protótipo menciona algumas dessas ações como conteúdo ilustrativo, não como funcionalidades exigidas.
