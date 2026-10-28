# ADR: API FastAPI e execução incremental

Status: aceita por solicitação do usuário. Este documento substitui as decisões de implementação dos documentos 02-07 quando houver divergência; o levantamento funcional e a referência visual continuam válidos.

## Contexto e decisão

O usuário escolheu FastAPI para a API, PostgreSQL e Docker para execução, Next.js no frontend e Gemini como provedor prioritário. O PDF pede TypeScript estrito: a API Python é uma exceção consciente a esse requisito, registrada aqui para não apresentar conformidade total indevida. Frontend e agente permanecem em TypeScript estrito; Python usa anotações e validação Pydantic. Confirmar a aceitação dessa exceção com o avaliador é recomendável antes da entrega.

- `apps/web`: Next.js, interface conforme o protótipo; proxy de mesma origem para a API.
- `apps/api`: FastAPI, sessões, autorização por recurso, conversas, confirmação, SLA e serviço simulado de chamados. SQLAlchemy, Alembic e PostgreSQL.
- `apps/agent`: Node.js/TypeScript, Mastra e Gemini. Contrato de decisão estruturado; sem acesso ao banco ou ferramentas de escrita.
- PostgreSQL: fonte de verdade para mensagens, decisões, estado de atendimento, rascunhos e operações idempotentes.

O serviço de chamados é um módulo separado dentro da API FastAPI. O agente recebe contexto filtrado e ferramentas de leitura; o servidor aplica as regras e controla todos os efeitos. Comunicação API/agente é privada e autenticada. Chaves de LLM ficam exclusivamente no serviço de agente.

## Garantias prioritárias

1. Identidade obtida da sessão; o modelo e o cliente não escolhem o solicitante.
2. Consultas e confirmação filtram proprietário; suporte exige papel de analista.
3. Alterações exigem rascunho persistido e confirmado; idempotência evita duplicidade.
4. Propriedade da conversa é persistida; assumir, devolver e encerrar são transições atômicas.
5. Uma geração em andamento só conclui se estado/epoch ainda forem válidos.
6. SLA e prioridade calculados por código; confiança do modelo é estimativa identificada.
7. Retentativas limitadas, timeout, uso de tokens quando disponível e erros explícitos; nenhum fallback silencioso para respostas fixas no modo real.

## Fluxo de desenvolvimento

Issues pequenas com critérios de aceite -> branch por entrega -> commits progressivos -> validação -> PR referenciando a issue -> merge após checks. Não usar credenciais, arquivos `.env` ou materiais originais do processo seletivo no repositório público. O inventário visual sanitizado serve de referência; o arquivo Pen original fica local.

Backlog: fundação e Compose; domínio/SLA; API e privacidade; agente e decisões; confirmação/duplicidade; frontend fiel; console e concorrência; testes/CI e documentação final. Diferenciais não atrasam requisitos obrigatórios.
