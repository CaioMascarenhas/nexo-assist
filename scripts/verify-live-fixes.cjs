/* Opt-in browser verification: four real model calls, using only demo accounts. */
const { chromium, expect } = require("@playwright/test");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const base = process.env.E2E_URL || "http://localhost:3000";
const output = path.resolve("output/verificacao-correcoes-live");
mkdirSync(output, { recursive: true });
const results = [];
let browser;
function record(name, detail) {
  results.push({ name, detail });
  writeFileSync(
    path.join(output, "resultados.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify({ name, ...detail }));
}
async function login(email) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(base);
  await page.getByLabel("E-mail corporativo").fill(email);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.locator(".workspace").waitFor();
  const runtime = await (await page.request.get(base + "/api/runtime")).json();
  expect(runtime.mode).toBe("live");
  return { context, page };
}
async function fresh(session) {
  const page = session.page;
  await page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/conversations") && r.request().method() === "GET",
  );
  const [r] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/conversations") &&
        r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Novo atendimento", exact: true }).click(),
  ]);
  expect(r.ok()).toBeTruthy();
  session.id = (await r.json()).id;
  await page.waitForResponse((r) =>
    r.url().endsWith("/api/conversations/" + session.id),
  );
  await expect(page.locator(".message-text")).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeEnabled();
}
async function history(s) {
  return (await s.page.request.get(base + "/api/conversations/" + s.id)).json();
}
async function resume(s, id) {
  const list = await (
    await s.page.request.get(base + "/api/conversations")
  ).json();
  const index = list.findIndex((c) => c.id === id);
  expect(index).toBeGreaterThanOrEqual(0);
  await s.page.getByLabel("Retomar atendimento", { exact: true }).click();
  await s.page.locator(".history-options button").nth(index).click();
  s.id = id;
  await s.page.waitForResponse((r) =>
    r.url().endsWith("/api/conversations/" + id),
  );
  await expect(
    s.page.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeEnabled();
}
async function send(s, content, name) {
  const before = Date.now();
  await s.page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill(content);
  await Promise.all([
    s.page.waitForResponse(
      (r) =>
        r.url().endsWith("/conversations/" + s.id + "/messages") &&
        r.request().method() === "POST",
      { timeout: 60000 },
    ),
    s.page
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click(),
  ]);
  await s.page
    .locator(".streaming")
    .waitFor({ state: "detached", timeout: 60000 });
  const h = await history(s);
  const m = h.messages.at(-1);
  const d = m.data.decision;
  record(name, {
    conversation: s.id,
    state: h.state,
    duration_ms: Date.now() - before,
    reply: m.content,
    error: m.data.error || false,
    code: m.data.code,
    request_id: m.data.request_id,
    intent: d?.intent,
    mode: d?.mode,
    facts: d?.facts,
  });
  await s.page.screenshot({
    path: path.join(output, name + ".png"),
    fullPage: true,
  });
  expect(m.data.error, m.content).not.toBeTruthy();
  expect(d?.mode).toBe("live");
  return h;
}
async function main() {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const carla = await login("carla.mendes@nexo.com.br");
  let h;
  if (!process.env.LIVE_RESUME_CONVERSATION) {
    await fresh(carla);
    h = await send(
      carla,
      "Minha VPN mostra erro 809 no Windows 10. Quero tentar uma orientação da central de ajuda.",
      "01-vpn",
    );
    expect(h.messages.at(-1).content).toMatch(/reinstale/i);
    h = await send(
      carla,
      "Reinstalei e reiniciei. A VPN voltou a funcionar, está resolvido. Não preciso de chamado.",
      "02-resolvido",
    );
    expect(h.messages.at(-1).data.decision.intent).toBe("resolved");
    expect(h.messages.at(-1).content).toContain("Que bom");
    expect(h.selected_ticket_id).toBeNull();
    await fresh(carla);
  } else {
    await resume(carla, process.env.LIVE_RESUME_CONVERSATION);
  }
  h = await send(
    carla,
    "Toda a equipe comercial está sem rede desde 13h. Todos estão impedidos de trabalhar e nenhum sistema abre, sem alternativa. Registre um incidente crítico de rede e encaminhe ao suporte.",
    "03-critico",
  );
  expect(h.handoff_reason).toBe("CRITICAL");
  expect(h.selected_ticket_id).toBeNull();
  await expect(carla.page.locator(".draft-card")).toContainText(
    "Aguardando confirmação",
  );
  await carla.page.screenshot({
    path: path.join(output, "03-rascunho-critico.png"),
    fullPage: true,
  });
  await carla.page
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  await expect(carla.page.locator(".draft-card")).toHaveCount(0);
  h = await history(carla);
  expect(h.selected_ticket_id).toBeTruthy();
  const ticket = await (
    await carla.page.request.get(base + "/api/tickets/" + h.selected_ticket_id)
  ).json();
  expect(ticket.priority).toBe("CRITICAL");
  expect(ticket.status).toBe("WAITING_ANALYST");
  const analyst = await login("luiza.costa@nexo.com.br");
  await analyst.page
    .getByLabel("Pesquisar conversa ou chamado")
    .fill(ticket.code);
  await analyst.page.waitForResponse(
    (r) =>
      r.url().includes("/analyst/conversations?") &&
      new URL(r.url()).searchParams.get("q") === ticket.code,
  );
  await analyst.page.locator(".conversation-row").first().click();
  await analyst.page
    .getByRole("button", { name: "Assumir atendimento", exact: true })
    .click();
  await analyst.page.setViewportSize({ width: 390, height: 844 });
  await analyst.page
    .getByRole("button", { name: "Mostrar chamados", exact: true })
    .click();
  await analyst.page
    .getByRole("button", { name: "Resolver chamado", exact: true })
    .click();
  await expect(
    analyst.page.getByRole("textbox", {
      name: "Solução aplicada",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await analyst.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await analyst.page.screenshot({
    path: path.join(output, "04-resolver-celular.png"),
    fullPage: true,
  });
  await analyst.page
    .getByRole("textbox", { name: "Solução aplicada", exact: true })
    .fill(
      "Teste de demonstração: conectividade restabelecida após ajuste do switch, acesso aos sistemas validado.",
    );
  await analyst.page
    .getByRole("button", { name: "Registrar solução", exact: true })
    .click();
  await expect(analyst.page.locator(".resolution-form")).toHaveCount(0);
  await expect(carla.page.locator(".timeline")).toContainText(
    `Chamado ${ticket.code} resolvido`,
  );
  const resolved = await (
    await carla.page.request.get(base + "/api/tickets/" + ticket.id)
  ).json();
  expect(resolved.status).toBe("RESOLVED");
  expect((await history(carla)).state).toBe("HUMAN_ACTIVE");
  await analyst.page.setViewportSize({ width: 1440, height: 1000 });
  await analyst.page
    .getByRole("button", { name: "Encerrar atendimento", exact: true })
    .click();
  await expect(
    analyst.page.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toHaveAttribute("placeholder", "Atendimento encerrado");
  await analyst.page.screenshot({
    path: path.join(output, "05-protocolo-resolvido.png"),
    fullPage: true,
  });
  record("04-resolucao-e-encerramento", {
    code: ticket.code,
    ticket_status: resolved.status,
    state: (await history(carla)).state,
    mobile: "sem overflow horizontal",
  });
  const ana = await login("ana.souza@nexo.com.br");
  await fresh(ana);
  h = await send(
    ana,
    "A impressora de crachás do setor falhou. Não sei se afeta só a mim ou a equipe, e ainda não sei a urgência. Pode me ajudar a confirmar esses pontos antes de registrar?",
    "06-incerteza",
  );
  expect(h.state).toBe("AGENT_ACTIVE");
  expect(h.selected_ticket_id).toBeNull();
  expect(h.messages.at(-1).content).toContain("?");
  record("FINAL", {
    passed: true,
    model_calls: process.env.LIVE_RESUME_CONVERSATION ? 2 : 4,
  });
}
main()
  .catch((error) => {
    record("FINAL", {
      passed: false,
      error: String(error.message).slice(0, 1500),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
  });
