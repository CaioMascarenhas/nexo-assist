import assert from "node:assert/strict";
import test from "node:test";
import { stubDecision, type Input } from "./decision.ts";
const base: Input = {
  content: "",
  facts: {},
  messages: [],
  tickets: [],
  articles: [],
};
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
