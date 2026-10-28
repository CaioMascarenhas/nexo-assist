# Fontes e evidências

> Levantamento inicial: decisões de implementação foram atualizadas. Consulte o [README executável](../README.md) e o [ADR FastAPI](09-arquitetura-fastapi.md) para a arquitetura vigente.


Consultadas em 27/10/2026. Referências técnicas são oficiais. Esta documentação descreve um plano; consulta a docs e metadados não equivale a testes da aplicação.

## Materiais do desafio

| Fonte | Uso |
| --- | --- |
| PRD v5 original (arquivo local n?o publicado) | Cinco páginas lidas por extração e renderização; fonte normativa |
| `telas.txt` (local) | URL fornecida pelo usuário |
| [Protótipo Pen](https://app.pen.dev/s/swhm7Xfy1krKDIc-QyqE9J8ZI2xFB0qbNvHIncCXcLg) | Canvas examinado visualmente; arquivo original baixado pelo botão da página |
| `nexo.pen` (local) | Referência original preservada; seis frames, textos, layout e tokens |
| [inventario-prototipo.json](referencias/inventario-prototipo.json) | Extração estruturada de frames, textos/fontes, variáveis e regiões principais |
| `prd-extraido.txt` (local) | Texto auxiliar extraído; em divergência usar PDF renderizado |

O PDF contém camadas de texto repetidas em algumas páginas quando lido por determinados extratores. A renderização das cinco páginas e a extração ordenada foram usadas para conferir a estrutura; a lista completa inclui o item 6, console do analista, e o item 7, visibilidade das decisões.

## Documentação técnica

| Fonte oficial | O que foi verificado |
| --- | --- |
| [Next.js: instalação](https://nextjs.org/docs/app/getting-started/installation) | App Router, TypeScript e requisitos de ambiente |
| [Mastra com Next.js](https://mastra.ai/integrations/frameworks/next-js) | Agente chamado diretamente por rotas Next.js; streaming e adaptador UI disponíveis |
| [Mastra PostgreSQL](https://mastra.ai/integrations/databases/postgresql) | `@mastra/pg`, `PostgresStore`, conexão/pool e schema configurável |
| [Mastra suspend/resume](https://mastra.ai/docs/workflows/suspend-and-resume) | Suspensão e retomada de workflows com persistência de snapshots |
| [Docker Compose: ordem de startup](https://docs.docker.com/compose/how-tos/startup-order/) | Prontidão depende de healthcheck e conditions, não apenas ordem de criação |
| [Drizzle e PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new) | Driver `pg` e migrations; página atual usa linha RC, exigindo atenção à versão escolhida |
| [PostgreSQL: versionamento](https://www.postgresql.org/support/versioning/) | PostgreSQL 18 como linha estável suportada consultada |
| [PostgreSQL: pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html) | Similaridade textual e índices GIN/GiST como opção para busca curta |
| [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) | Modelo estável e suporte declarado a function calling/structured output |
| [Gemini: saída estruturada](https://ai.google.dev/gemini-api/docs/structured-output) | Schema JSON para extração/classificação; não garante correção semântica das regras |
| [Vitest](https://vitest.dev/guide/) | Framework para testes TypeScript |
| [Playwright](https://playwright.dev/docs/intro) | Jornadas E2E, isolamento e múltiplos navegadores |

## Metadados de dependências

Versões e engines foram consultados diretamente no registro npm, sem instalar pacotes no projeto. Comandos de referência:

```powershell
npm view next version engines --json
npm view react version --json
npm view @mastra/core version engines peerDependencies --json
npm view @mastra/pg version peerDependencies --json
npm view @mastra/ai-sdk version peerDependencies --json
npm view @ai-sdk/react version peerDependencies --json
npm view drizzle-orm dist-tags --json
npm view drizzle-kit version --json
```

O resultado relevante foi resumido na tabela de versões de arquitetura. Dependências não foram combinadas nem executadas; a etapa 0 serve para validar isso. Nenhuma API paga de modelo foi chamada neste levantamento.

## Ambiente observado

Somente PDF e `telas.txt` estavam na raiz inicialmente; não havia aplicação, `package.json` ou `AGENTS.md` no workspace examinado. Node, Git, Docker CLI e Compose estão disponíveis. Docker daemon Linux não respondeu e pnpm não está disponível. Não inicializamos projeto, instalamos dependências de aplicação, iniciamos containers, publicamos conteúdo ou criamos commits neste levantamento.
