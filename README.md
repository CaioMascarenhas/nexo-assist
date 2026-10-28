# Nexo Assist - preparação do desafio técnico

Levantamento realizado em **27/10/2026**, a partir das cinco páginas do PRD e do arquivo original do [protótipo](https://app.pen.dev/s/swhm7Xfy1krKDIc-QyqE9J8ZI2xFB0qbNvHIncCXcLg), indicado em `telas.txt`.

**Status: requisitos e estratégia documentados; aplicação ainda não implementada.** Os comandos de execução da futura aplicação são metas de entrega, não comandos disponíveis neste momento.

## Direção proposta

Construir um atendimento de TI com chat do funcionário, agente Mastra e console do analista. A prioridade é demonstrar decisões corretas, justificadas e verificáveis, com confirmação antes de alterar chamados e pausa efetiva do agente durante atendimento humano.

| Camada | Escolha | Situação |
| --- | --- | --- |
| Interface e BFF | Next.js App Router + React + TypeScript estrito | Next.js definido pelo usuário |
| Banco | PostgreSQL 18, com migrations e volume persistente | PostgreSQL definido pelo usuário |
| Execução | Docker + Docker Compose | Definido pelo usuário |
| Agente | Mastra, integrado ao servidor Next.js como módulo separado | Preferência expressa do PRD |
| Serviço de chamados | Módulo de servidor dentro do Next.js, com contrato próprio e persistência PostgreSQL | Separação lógica do agente; sem API/processo Fastify adicional |
| Acesso a dados | Drizzle ORM + driver `pg` | Recomendação |
| UI | Tailwind CSS + componentes acessíveis Radix/shadcn adaptados ao protótipo | Recomendação |
| Tempo real | Streaming por SSE; mensagens enviadas por HTTP | Recomendação |
| LLM | Google Gemini Flash, configurável por ambiente | Preferência informada pelo usuário, que possui créditos; validar API, modelo e integração |
| Qualidade | Vitest + Playwright + avaliação de decisões por cenários | Recomendação |

Mastra possui integração oficial com Next.js e persistência PostgreSQL. As versões, justificativas e fontes estão em [arquitetura e tecnologias](docs/02-arquitetura-e-tecnologias.md).

## Documentação para começar

1. [Requisitos, regras e critérios de aceite](docs/01-requisitos.md).
2. [Arquitetura, tecnologias, Docker e ambiente](docs/02-arquitetura-e-tecnologias.md).
3. [Estratégia do agente, decisões e transferência](docs/03-agente-e-regras.md).
4. [Modelo de dados e contratos de API](docs/04-dados-e-contratos.md).
5. [Inventário das telas e fidelidade visual](docs/05-telas-e-experiencia.md).
6. [Plano de execução, testes e demonstração](docs/06-plano-e-validacao.md).
7. [Premissas, divergências e riscos](docs/07-decisoes-e-pendencias.md).
8. [Fontes consultadas e evidências](docs/08-fontes.md).

## Pontos que mais pesam na solução

- O detalhe de cada resposta precisa mostrar intenção, ação, confiança e justificativa baseada em evidências. Um chat visualmente pronto não atende sozinho ao desafio.
- Criação, atualização e reabertura precisam de rascunho confirmado, inclusive quando existe chamado semelhante.
- Privacidade e pausa do agente são garantidas pelo servidor, sem depender de instruções ao modelo.
- SLA é calculado por código, com calendário explícito, e não pelo LLM.
- Chamados, mensagens, rascunhos, decisões e estado humano/agente sobrevivem ao reinício.
- O serviço simulado deve demonstrar indisponibilidade temporária e retentativa sem duplicar operações. Dados fictícios ficam no PostgreSQL; o mock não é uma lista volátil em memória.

## Situação do ambiente local

Verificado: Node.js `24.21.0`, Git `2.44.0`, Docker CLI `29.5.2` e Docker Compose `5.1.4`. O daemon Linux do Docker Desktop não estava disponível na inspeção. Precisaremos iniciar o Docker Desktop para validar containers. `pnpm` não foi encontrado; a proposta usa npm numa única aplicação, evitando essa dependência adicional.

A primeira etapa de implementação será uma prova curta de integração: Next.js + Mastra + PostgreSQL + uma resposta transmitida em streaming e persistida. Essa etapa valida as versões e o provedor antes de expandir os fluxos.

## Prioridade de entrega

O usuário pediu entrega **o mais breve possível**, sem data limite fixa. Vamos priorizar o fluxo obrigatório completo: login, chat com decisões visíveis, chamados confirmados, atendimento humano e persistência. Deploy, perfil complementar e recursos decorativos ficam após esse marco. Gemini é a primeira opção para aproveitar os créditos informados; antes do smoke real, validar em qual API/projeto esses créditos podem ser usados.

Arquitetura simplificada: uma aplicação Next.js e PostgreSQL no Docker. O agente usa a interface `TicketService`; o módulo de chamados implementa as operações e permite simular erros/atrasos. Separação por módulo é nossa interpretação do PRD, que não exige outro servidor HTTP. Execuções interrompidas são registradas e retomadas por requisição explícita, sem worker dedicado na primeira entrega.

## Referências preservadas

- PRD original na raiz: `Desafio_Tecnico_Nexo_Assist_PRD_v5.pdf`.
- [Arquivo original das telas](docs/referencias/nexo.pen), baixado do protótipo.
- [Inventário de textos, medidas e tokens](docs/referencias/inventario-prototipo.json), extraído do arquivo original.
- [Texto do PRD](docs/referencias/prd-extraido.txt), apoio à busca; o PDF prevalece.

O README final da entrega deverá substituir este status por instruções executáveis, contas de demonstração, arquitetura efetiva, avaliação do agente, trade-offs e limitações verificadas.
