import assert from "node:assert/strict";
import test from "node:test";
import { outputSchema, stubDecision, type Input } from "./decision.ts";
const base: Input = {
  content: "",
  facts: {},
  messages: [],
  tickets: [],
  articles: [],
};

test("duplicidade diferencia QGIS de FluxogramaQA no modo de testes", () => {
  const result = stubDecision({
    ...base,
    content: "Quero instalar o software QGIS. Só eu, sem urgência.",
    duplicate_candidates: [
      {
        id: "fluxograma",
        code: "REQ-FLUXO",
        title: "Instalação do software FluxogramaQA",
        description: "Diagramas de processos",
        category: "Software",
        kind: "REQ",
        version: 1,
        status: "OPEN",
      },
    ],
  });
  assert.equal(result.duplicate_reviews[0].result, "different");
  assert.equal(
    outputSchema.parse(result).duplicate_reviews[0].ticket_id,
    "fluxograma",
  );
});

test("contrato de duplicidade rejeita decisão desconhecida e evidência sem origem", () => {
  const result = stubDecision(base);
  assert.equal(
    outputSchema.safeParse({
      ...result,
      duplicate_reviews: [
        {
          ticket_id: "exemplo",
          result: "probably",
          reason: "Títulos próximos",
          evidence: [],
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    outputSchema.safeParse({
      ...result,
      duplicate_reviews: [
        {
          ticket_id: "exemplo",
          result: "same",
          reason: "Mesmo sistema e sintoma",
          evidence: [
            {
              aspect: "system",
              request_quote: "QGIS",
            },
          ],
        },
      ],
    }).success,
    false,
  );
});
test("offline mode distinguishes explicit human request and out-of-scope", () => {
  assert.equal(
    stubDecision({ ...base, content: "Quero falar com um analista" }).intent,
    "handoff",
  );
  assert.equal(
    stubDecision({ ...base, content: "Preciso pedir férias" }).intent,
    "out_of_scope",
  );
});
test("unknown impact is not guessed and Windows restriction is retained", () => {
  const result = stubDecision({
    ...base,
    content: "VPN erro 809 no Windows 11",
  });
  assert.equal(result.facts.os, "Windows 11");
  assert.equal(result.facts.affected_scope, undefined);
  assert.equal(result.facts.blocked, undefined);
});

test("workaround does not imply absence of urgency and negative reply overrides today keyword", () => {
  const facts = stubDecision({
    ...base,
    content: "Minha equipe tem erro na VPN, mas tenho alternativa",
  }).facts;
  assert.equal(facts.affected_scope, "team");
  assert.equal(facts.blocked, false);
  assert.equal(facts.workaround, true);
  assert.equal(facts.same_day, undefined);
  assert.equal(
    stubDecision({
      ...base,
      facts,
      content: "Não tenho compromisso em risco hoje",
    }).facts.same_day,
    false,
  );
  assert.equal(
    stubDecision({ ...base, facts, content: "Tenho compromisso em risco hoje" })
      .facts.same_day,
    true,
  );
});

test("resolution is distinct from unsuccessful guidance and a new problem", () => {
  assert.equal(
    stubDecision({
      ...base,
      content: "Reinstalei. A VPN voltou a funcionar, está resolvido.",
    }).intent,
    "resolved",
  );
  assert.notEqual(
    stubDecision({
      ...base,
      content: "Não está resolvido, a VPN continua sem funcionar.",
    }).intent,
    "resolved",
  );
  assert.notEqual(
    stubDecision({
      ...base,
      content: "Voltou a funcionar, mas ainda apresenta erro.",
    }).intent,
    "resolved",
  );
});

test("losing a workaround removes stale nonblocking status without assuming blockage", () => {
  const result = stubDecision({
    ...base,
    facts: { workaround: true, blocked: false },
    content: "Agora eu não tenho mais alternativa",
  });
  assert.equal(result.facts.workaround, false);
  assert.equal(result.facts.blocked, undefined);
  assert.equal(
    stubDecision({
      ...base,
      facts: result.facts,
      content: "Não consigo trabalhar",
    }).facts.blocked,
    true,
  );
});

test("announcing information requests collection and canceled meeting removes urgency", () => {
  assert.equal(
    stubDecision({ ...base, content: "Tenho mais informações" }).collect_update,
    true,
  );
  const changed = stubDecision({
    ...base,
    facts: { same_day: true, blocked: true },
    content: "A reunião foi cancelada",
  });
  assert.equal(changed.collect_update, false);
  assert.equal(changed.facts.same_day, false);
  assert.equal(changed.facts.blocked, true);
});
