import assert from "node:assert/strict";
import test from "node:test";
import { stubDecision, type Input } from "./decision.ts";
const base: Input = {content: "", facts: {}, messages: [], tickets: [], articles: []};
test("offline mode distinguishes explicit human request and out-of-scope", () => {
  assert.equal(stubDecision({...base, content: "Quero falar com um analista"}).intent, "handoff");
  assert.equal(stubDecision({...base, content: "Preciso pedir férias"}).intent, "out_of_scope");
});
test("unknown impact is not guessed and Windows restriction is retained", () => {
  const result = stubDecision({...base, content: "VPN erro 809 no Windows 11"});
  assert.equal(result.facts.os, "Windows 11");
  assert.equal(result.facts.affected_scope, undefined);
  assert.equal(result.facts.blocked, undefined);
});
