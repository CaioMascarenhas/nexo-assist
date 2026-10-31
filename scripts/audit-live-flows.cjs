/* Auditoria opt-in: dez conversas reais, evidências incrementais e teto de chamadas. */
const { chromium, expect } = require("@playwright/test");
const {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} = require("node:fs");
const path = require("node:path");

const plan = [
  [
    "01-vpn",
    "carla",
    "VPN Windows 10: orientação e tentativa bem-sucedida, sem protocolo",
  ],
  [
    "02-limites-cancelamento",
    "ana",
    "Fora de TI, horário, edição/cancelamento de requisição e privacidade",
  ],
  [
    "03-fluxograma",
    "bruno",
    "Instalação de FluxogramaQA, confirmação e passagem direta N1 → N2",
  ],
  ["04-qgis-diferente", "bruno", "QGIS não deve ser associado ao FluxogramaQA"],
  [
    "05-qgis-duplicado",
    "bruno",
    "Mesmo QGIS com outro título: complemento no protocolo existente",
  ],
  [
    "06-impressora",
    "carla",
    "Alcance desconhecido, esclarecimento, alternativa e encerramento bloqueado",
  ],
  [
    "07-outlook",
    "ana",
    "Orientação sem sucesso, alternativa pelo webmail e atendimento humano",
  ],
  [
    "08-acesso-prioridade",
    "ana",
    "Acesso urgente, devolução à IA, redução/aumento de prioridade e edição",
  ],
  [
    "09-reabertura",
    "bruno",
    "Consulta de resolvido, cancelamento da reabertura, nova tentativa e solução",
  ],
  [
    "10-critico",
    "carla",
    "Caso crítico, assunção antes da confirmação, N1 → N2 e devolução",
  ],
];
if (!process.argv.includes("--run-live")) {
  console.log(
    JSON.stringify(
      {
        plano: plan,
        teto_chamadas: 40,
        executar: "node scripts/audit-live-flows.cjs --run-live",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const base = process.env.E2E_URL || "http://localhost:3000";
const runId = process.env.LIVE_RUN_ID || `estabilidade-${Date.now()}`;
if (!/^[a-zA-Z0-9_-]+$/.test(runId))
  throw new Error("Identificador da rodada inválido.");
const output = path.resolve("output", runId);
const resume = process.argv.includes("--resume");
const resultPath = path.join(output, "resultados.json");
if (existsSync(resultPath) && !resume)
  throw new Error(
    "A rodada já existe. Use outro LIVE_RUN_ID ou --resume para preservar as evidências.",
  );
if (resume && !existsSync(resultPath))
  throw new Error("Rodada não encontrada para retomada.");
mkdirSync(output, { recursive: true });
const report = resume
  ? JSON.parse(readFileSync(resultPath, "utf8"))
  : {
      rodada: runId,
      inicio_utc: new Date().toISOString(),
      teto_chamadas: 40,
      tentativas_ia: 0,
      plano: plan,
      conversas: [],
      eventos: [],
      verificacoes: [],
      baseline: {},
      final: {},
    };
if (resume) {
  writeFileSync(
    path.join(output, `resultados-antes-retomada-${Date.now()}.json`),
    JSON.stringify(report, null, 2),
  );
  report.retomadas = [
    ...(report.retomadas || []),
    {
      instante_utc: new Date().toISOString(),
      motivo:
        "Coleta pelo histórico persistido, sem repetir mensagens respondidas.",
    },
  ];
}
const sessions = {};
const createdTickets = new Set(report.protocolos_criados || []);
const shared = report.shared || {};
report.shared = shared;
let browser, current;
function save() {
  writeFileSync(
    path.join(output, "resultados.json"),
    JSON.stringify(report, null, 2),
  );
}
function record(event) {
  report.eventos.push({
    cenario: current?.id,
    instante_utc: new Date().toISOString(),
    ...event,
  });
  save();
  console.log(
    JSON.stringify({
      cenario: current?.id,
      etapa: event.etapa,
      tipo: event.tipo,
      estado: event.estado,
      duracao_ms: event.duracao_ms,
    }),
  );
}
function check(name, condition, details = {}) {
  report.verificacoes.push({
    cenario: current.id,
    verificacao: name,
    passou: !!condition,
    ...details,
  });
  save();
  if (!condition)
    console.log(
      JSON.stringify({ cenario: current.id, falha: name, ...details }),
    );
  return !!condition;
}
function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}
async function api(session, route, data, expected = 200) {
  const response =
    data === undefined
      ? await session.context.request.get(base + "/api" + route)
      : await session.context.request.post(base + "/api" + route, { data });
  const result = await response.json();
  requireThat(
    response.status() === expected,
    `${route}: HTTP ${response.status()} — ${result.detail || "resposta inesperada"}`,
  );
  return result;
}
async function history(s) {
  return api(s, `/conversations/${s.id}`);
}
function pending(h) {
  return h.drafts.filter((d) => d.status === "PENDING" && !d.expired).at(-1);
}
async function shot(s, name, mobile = false) {
  await s.page.setViewportSize(
    mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
  );
  const file = `${current.id}-${name}${mobile ? "-mobile" : ""}.png`;
  await s.page.screenshot({ path: path.join(output, file), fullPage: true });
  check(
    `Sem rolagem horizontal: ${name}${mobile ? " (390 px)" : ""}`,
    await s.page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  record({ tipo: "captura", etapa: name, arquivo: file });
}
async function openEmployee(s, id = s.id) {
  s.id = id;
  await s.page.goto(base);
  await expect(s.page.locator(".timeline")).toBeVisible();
  const list = await api(s, "/conversations");
  const index = list.findIndex((item) => item.id === id);
  requireThat(
    index >= 0,
    "Conversa não encontrada no histórico do funcionário.",
  );
  if (index > 0) {
    await s.page.getByLabel("Retomar atendimento", { exact: true }).click();
    await s.page.locator(".history-options button").nth(index).click();
  }
  await expect(
    s.page.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeVisible();
}
async function fresh(s) {
  const previous =
    resume && report.conversas.find((entry) => entry.cenario === current.id);
  if (previous) {
    s.id = previous.id;
    current.conversation_id = s.id;
    await openEmployee(s);
    record({
      tipo: "retomada",
      etapa: "conversa-existente",
      conversation_id: s.id,
    });
    return;
  }
  const conversation = await api(s, "/conversations", {});
  s.id = conversation.id;
  current.conversation_id = s.id;
  report.conversas.push({ cenario: current.id, conta: s.user.email, id: s.id });
  save();
  await openEmployee(s);
  record({
    tipo: "conversa",
    etapa: "criada",
    conversation_id: s.id,
    estado: conversation.state,
  });
}
async function send(s, content, stage) {
  const before = await history(s);
  if (resume) {
    const index = before.messages.findIndex(
      (message) => message.role === "USER" && message.content === content,
    );
    if (index >= 0) {
      const reply = before.messages
        .slice(index + 1)
        .find((message) => message.data.decision || message.data.error);
      if (!reply && before.state !== "AGENT_ACTIVE") {
        record({
          tipo: "mensagem_com_ia_pausada",
          etapa: stage,
          conversation_id: s.id,
          entrada: content,
          estado: before.state,
          agent_paused: true,
          coleta: "historico_persistido",
          duracao_ms: null,
        });
        check(`Mensagem humana recuperada sem repetição: ${stage}`, true);
        return before;
      }
      requireThat(
        reply?.data.decision?.mode === "live",
        "A mensagem anterior ainda não tem uma decisão persistida; não será reenviada automaticamente.",
      );
      if (!report.eventos.some((event) => event.message_id === reply.id))
        record({
          tipo: "interacao_ia",
          etapa: stage,
          conversation_id: s.id,
          entrada: content,
          resposta: reply.content,
          estado: before.state,
          message_id: reply.id,
          decisao: reply.data.decision,
          duracao_agente_ms: reply.data.decision.duration_ms,
          duracao_ms: null,
          erro: null,
          coleta: "historico_persistido",
          rascunho: pending(before),
        });
      check(`Decisão real recuperada sem repetição: ${stage}`, true);
      return before;
    }
  }
  const active = before.state === "AGENT_ACTIVE";
  if (active) {
    requireThat(
      report.tentativas_ia < report.teto_chamadas,
      "Teto de chamadas atingido.",
    );
    report.tentativas_ia += 1;
    save();
  }
  const started = Date.now();
  const responsePromise = s.page.waitForResponse(
    (response) =>
      response.url().endsWith(`/conversations/${s.id}/messages`) &&
      response.request().method() === "POST",
    { timeout: 65000 },
  );
  await s.page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill(content);
  await s.page
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  const response = await responsePromise;
  // O CDP não disponibiliza de forma confiável o body de respostas SSE.
  // Esperamos a UI consumir o stream e conferimos a mensagem gravada pela API.
  const json = {
    agent_paused: !active,
    fonte: "estado_e_historico_persistidos",
  };
  await expect(s.page.locator(".streaming")).toHaveCount(0, { timeout: 65000 });
  const h = await history(s);
  const persisted = h.messages
    .slice(before.messages.length)
    .findLast((message) => message.data.decision || message.data.error);
  const decision = persisted?.data.decision;
  const error = persisted?.data.error ? persisted.data : null;
  const reply = persisted?.content || h.messages.at(-1)?.content;
  record({
    tipo: active ? "interacao_ia" : "mensagem_com_ia_pausada",
    etapa: stage,
    conversation_id: s.id,
    message_id: persisted?.id,
    entrada: content,
    resposta: reply,
    estado: h.state,
    http_status: response.status(),
    duracao_ms: Date.now() - started,
    duracao_agente_ms: decision?.duration_ms,
    decisao: decision,
    erro: error || (response.ok() ? null : json),
    agent_paused: json?.agent_paused,
    rascunho: pending(h),
  });
  check(`Envio concluído: ${stage}`, response.ok() && !error);
  if (active) check(`Decisão real: ${stage}`, decision?.mode === "live");
  else
    check(
      `IA permaneceu pausada: ${stage}`,
      json?.agent_paused === true && h.turns === before.turns,
    );
  requireThat(
    response.ok() && !error && (!active || decision?.mode === "live"),
    `Falha de geração/envio em ${stage}; não haverá retentativa automática.`,
  );
  return h;
}
async function draft(s, initial, context, expectedTarget = null) {
  let h = await send(s, initial, "relato-inicial");
  for (
    let attempt = 0;
    !pending(h) && h.state === "AGENT_ACTIVE" && attempt < 2;
    attempt++
  ) {
    const options = h.messages.at(-1)?.data.quickReplies || [];
    const answer = options.some((item) => item.startsWith("É o mesmo chamado"))
      ? expectedTarget
        ? `É o mesmo chamado ${expectedTarget.code}`
        : "É um novo pedido"
      : context;
    h = await send(s, answer, `esclarecimento-${attempt + 1}`);
  }
  requireThat(
    pending(h),
    "Não houve rascunho após os esclarecimentos previstos.",
  );
  return { h, d: pending(h) };
}
async function confirm(s, d, duplicate = false) {
  await expect(s.page.locator(".draft-card")).toContainText(d.payload.title);
  const responsePromise = s.page.waitForResponse(
    (response) =>
      response.url().endsWith(`/drafts/${d.id}/confirm`) &&
      response.request().method() === "POST",
  );
  await s.page.getByRole("button", { name: "Confirmar", exact: true }).click();
  const response = await responsePromise;
  const result = await response.json();
  record({
    tipo: "confirmacao",
    etapa: "confirmar",
    http_status: response.status(),
    resultado: result,
  });
  requireThat(response.ok(), `Confirmação recusada: ${result.detail}`);
  await expect(s.page.locator(".draft-card")).toHaveCount(0);
  if (d.operation === "CREATE") createdTickets.add(result.ticket.id);
  report.protocolos_criados = [...createdTickets];
  save();
  if (duplicate) {
    const replay = await api(s, `/drafts/${d.id}/confirm`, {
      revision: d.revision,
    });
    check(
      "Confirmação repetida é idempotente",
      replay.ticket.id === result.ticket.id &&
        replay.ticket.version === result.ticket.version,
    );
  }
  return result.ticket;
}
async function cancel(s, d) {
  const responsePromise = s.page.waitForResponse(
    (response) =>
      response.url().endsWith(`/drafts/${d.id}/cancel`) &&
      response.request().method() === "POST",
  );
  await s.page.getByRole("button", { name: "Cancelar", exact: true }).click();
  const response = await responsePromise;
  requireThat(response.ok(), "Cancelamento não concluído.");
  await expect(s.page.locator(".draft-card")).toHaveCount(0);
  record({ tipo: "cancelamento", etapa: "cancelar", rascunho_id: d.id });
}
async function edit(s, d, title, description) {
  await s.page.getByRole("button", { name: "Editar", exact: true }).click();
  if (d.operation === "CREATE")
    await s.page.getByLabel("Título", { exact: true }).fill(title);
  await s.page
    .getByRole("textbox", { name: "Descrição", exact: true })
    .fill(description);
  await s.page
    .getByRole("button", { name: "Salvar revisão", exact: true })
    .click();
  await expect(
    s.page.getByRole("button", { name: "Confirmar", exact: true }),
  ).toBeEnabled();
  const revised = pending(await history(s));
  check("Editar incrementa a revisão", revised?.revision === d.revision + 1);
  record({
    tipo: "edicao",
    etapa: "editar-rascunho",
    antes: d,
    depois: revised,
  });
  return revised;
}
async function claim(s, analyst = sessions.n1) {
  const h = await history(s);
  requireThat(
    h.state === "WAITING_ANALYST",
    `Assunção exige fila humana; estado atual ${h.state}.`,
  );
  const claimed = await api(analyst, `/analyst/conversations/${s.id}/claim`, {
    epoch: h.epoch,
  });
  check(
    "Analista assume o atendimento",
    claimed.state === "HUMAN_ACTIVE" && claimed.analyst_id === analyst.user.id,
  );
  record({ tipo: "atendimento_humano", etapa: "assumir", resultado: claimed });
  return claimed;
}
async function analystMessage(s, analyst, content) {
  if (
    (await history(s)).messages.some(
      (message) =>
        message.role === "ANALYST" &&
        message.author === analyst.user.name &&
        message.content === content,
    )
  )
    return;
  await api(analyst, `/analyst/conversations/${s.id}/messages`, {
    content,
    client_id: `auditoria-${runId}-${current.id}-${Date.now()}`,
  });
  record({
    tipo: "atendimento_humano",
    etapa: "responder",
    analista: analyst.user.name,
    conteudo: content,
  });
}
async function release(s, analyst = sessions.n1) {
  const h = await history(s);
  const result = await api(analyst, `/analyst/conversations/${s.id}/release`, {
    epoch: h.epoch,
  });
  check(
    "Devolução retoma a IA",
    result.state === "AGENT_ACTIVE" && result.analyst_id === null,
  );
  await openEmployee(s);
  record({ tipo: "atendimento_humano", etapa: "devolver", resultado: result });
}
async function openAnalyst(analyst, s, ticket) {
  analyst.expectedConversation = s.id;
  await analyst.page.setViewportSize({ width: 1440, height: 1000 });
  await analyst.page.goto(base);
  await analyst.page
    .getByLabel("Pesquisar conversa ou chamado")
    .fill(ticket?.code || s.user.name);
  const list = await api(
    analyst,
    `/analyst/conversations?q=${encodeURIComponent(ticket?.code || s.user.name)}`,
  );
  const index = list.findIndex((item) => item.id === s.id);
  requireThat(index >= 0, "Atendimento não localizado na busca do console.");
  await expect(analyst.page.locator(".conversation-row")).toHaveCount(
    list.length,
  );
  await analyst.page.locator(".conversation-row").nth(index).click();
  const h = await history(s);
  if (h.state === "HUMAN_ACTIVE")
    await expect(analyst.page.locator(".assigned-banner")).toContainText(
      h.assigned_analyst.name,
    );
  else if (h.state === "CLOSED")
    await expect(
      analyst.page.getByRole("textbox", { name: "Mensagem", exact: true }),
    ).toHaveAttribute("placeholder", "Atendimento encerrado");
}
async function transfer(s, from, to, ticket, mobile = false) {
  const before = ticket ? await api(s, `/tickets/${ticket.id}`) : null;
  await openAnalyst(from, s, ticket);
  await from.page
    .getByRole("button", { name: "Encaminhar atendimento", exact: true })
    .click();
  await from.page.getByLabel("Analista de destino").selectOption(to.user.id);
  const reason = `Rodada ${runId}: diagnóstico inicial registrado; encaminhamento para análise especializada do mesmo assunto.`;
  await from.page.getByLabel("Motivo do encaminhamento").fill(reason);
  await shot(from, "formulario-encaminhamento", mobile);
  const responsePromise = from.page.waitForResponse(
    (response) =>
      response.url().endsWith(`/analyst/conversations/${s.id}/transfer`) &&
      response.request().method() === "POST",
  );
  await from.page
    .getByRole("button", { name: "Confirmar encaminhamento", exact: true })
    .click();
  const response = await responsePromise;
  const result = await response.json();
  requireThat(response.ok(), `Encaminhamento recusado: ${result.detail}`);
  check(
    "Passagem direta mantém atendimento humano",
    result.state === "HUMAN_ACTIVE" && result.analyst_id === to.user.id,
  );
  if (before) {
    const after = await api(s, `/tickets/${ticket.id}`);
    check(
      "Passagem preserva protocolo e SLA",
      after.id === before.id &&
        after.due_at === before.due_at &&
        after.support_updated_at === before.support_updated_at,
    );
  }
  const previousMine = await api(from, "/analyst/conversations?filter=mine");
  const nextMine = await api(to, "/analyst/conversations?filter=mine");
  check(
    "Responsabilidade muda de Minhas do N1 para Minhas do N2",
    !previousMine.some((item) => item.id === s.id) &&
      nextMine.some((item) => item.id === s.id),
  );
  const late = await from.context.request.post(
    base + `/api/analyst/conversations/${s.id}/messages`,
    {
      data: {
        content: "Tentativa de resposta pelo responsável anterior.",
        client_id: `antigo-${Date.now()}`,
      },
    },
  );
  check("Responsável anterior não pode responder", late.status() === 409);
  record({ tipo: "encaminhamento", etapa: "n1-n2", resultado: result });
  return result;
}
async function finish(
  s,
  ticket,
  analyst = sessions.n1,
  label = "Fluxo validado",
) {
  let h = await history(s);
  if (h.state === "CLOSED") {
    check(
      "Contato já encerrado preserva o resolvido",
      (await api(s, `/tickets/${ticket.id}`)).status === "RESOLVED",
    );
    return;
  }
  if (h.state === "WAITING_ANALYST") h = await claim(s, analyst);
  requireThat(
    h.analyst_id === analyst.user.id,
    "A resolução exige o responsável correto.",
  );
  const latest = await api(s, `/tickets/${ticket.id}`);
  if (!["RESOLVED", "CLOSED"].includes(latest.status)) {
    const resolution = `Rodada ${runId} — solução simulada: ${label}. Validação do fluxo de atendimento; nenhum reparo ou instalação real foi executado.`;
    const resolved = await api(
      analyst,
      `/analyst/conversations/${s.id}/resolve-ticket`,
      {
        epoch: h.epoch,
        ticket_id: latest.id,
        version: latest.version,
        resolution,
      },
    );
    check(
      "Solução fica persistida",
      resolved.ticket.status === "RESOLVED" &&
        resolved.ticket.updates.at(-1).content === resolution,
    );
  }
  h = await history(s);
  const closed = await api(analyst, `/analyst/conversations/${s.id}/close`, {
    epoch: h.epoch,
  });
  check(
    "Encerrar mantém o protocolo resolvido",
    closed.state === "CLOSED" &&
      (await api(s, `/tickets/${ticket.id}`)).status === "RESOLVED",
  );
  record({
    tipo: "atendimento_humano",
    etapa: "resolver-encerrar",
    ticket_id: ticket.id,
    analista: analyst.user.name,
  });
}

async function runScenario(row, fn) {
  if (resume && report.final[row[0]]?.resultado === "PASSOU") return;
  current = {
    id: row[0],
    titulo: row[2],
    inicio_utc: new Date().toISOString(),
  };
  report.final[current.id] = current;
  save();
  const s = sessions[row[1]];
  try {
    await fresh(s);
    await fn(s);
  } catch (error) {
    current.excecao = error.message;
    record({ tipo: "falha", etapa: "interrompida", mensagem: error.message });
  }
  try {
    if (current.conversation_id) {
      const h = await history(s);
      writeFileSync(
        path.join(output, `${current.id}-conversa.json`),
        JSON.stringify(h, null, 2),
      );
      current.estado_final = h.state;
      current.ticket_id = h.selected_ticket_id;
      await shot(s, "estado-final");
    }
  } catch (error) {
    current.erro_evidencia = error.message;
  }
  const failures = report.verificacoes.filter(
    (item) => item.cenario === current.id && !item.passou,
  );
  current.resultado = current.excecao || failures.length ? "FALHOU" : "PASSOU";
  current.fim_utc = new Date().toISOString();
  save();
  console.log(
    JSON.stringify({
      cenario: current.id,
      resultado: current.resultado,
      falhas: failures.length,
      excecao: current.excecao,
    }),
  );
}

async function main() {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const [key, email] of Object.entries({
    ana: "ana.souza@nexo.com.br",
    carla: "carla.mendes@nexo.com.br",
    bruno: "bruno.tavares@nexo.com.br",
    n1: "luiza.costa@nexo.com.br",
    n2: "rafael.lima@nexo.com.br",
  })) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    sessions[key] = { context, page };
    await page.route("**/api/analyst/conversations/**", async (route) => {
      const match = new URL(route.request().url()).pathname.match(
        /\/analyst\/conversations\/([^/]+)\//,
      );
      if (
        route.request().method() === "POST" &&
        match &&
        match[1] !== sessions[key].expectedConversation
      ) {
        record({
          tipo: "automacao",
          etapa: "mutacao-bloqueada",
          esperado: sessions[key].expectedConversation,
          recebido: match[1],
        });
        await route.abort();
      } else await route.continue();
    });
    sessions[key].user = await api(sessions[key], "/auth/login", {
      email,
      password: "demo",
    });
  }
  report.runtime = await api(sessions.ana, "/runtime");
  requireThat(
    report.runtime.mode === "live",
    "A rodada exige o modelo real, sem fallback.",
  );
  for (const key of ["ana", "carla", "bruno"])
    if (!report.baseline[key])
      report.baseline[key] = {
        tickets: await api(sessions[key], "/tickets"),
        conversas: await api(sessions[key], "/conversations"),
      };
  save();

  await runScenario(plan[0], async (s) => {
    const before = await api(s, "/tickets");
    let h = await send(
      s,
      "Minha VPN mostra erro 809 no Windows 10. Existe uma orientação da central de ajuda para eu tentar antes de abrir chamado?",
      "orientacao-vpn",
    );
    check(
      "VPN oferece artigo aplicável ao Windows 10",
      h.messages.at(-1).content.includes("reinstale"),
    );
    h = await send(
      s,
      "Reinstalei o cliente pelo portal e reiniciei. A VPN voltou a funcionar; obrigado, não preciso de chamado.",
      "tentativa-bem-sucedida",
    );
    check(
      "Orientação resolvida não cria protocolo",
      !pending(h) &&
        h.selected_ticket_id === null &&
        (await api(s, "/tickets")).length === before.length,
    );
  });
  await runScenario(plan[1], async (s) => {
    let h = await send(
      s,
      "Preciso pedir reembolso de uma viagem ao financeiro. Vocês resolvem por aqui?",
      "fora-de-ti",
    );
    check(
      "Assunto financeiro não abre chamado de TI",
      !pending(h) && h.messages.at(-1).data.decision.intent === "out_of_scope",
    );
    h = await send(
      s,
      "E qual é o horário de funcionamento do service desk de TI?",
      "horario",
    );
    check(
      "Horário usa fonte aplicável",
      h.messages
        .at(-1)
        .data.decision.sources.some(
          (item) => item.id === "hours" && item.applicable,
        ),
    );
    const before = await api(s, "/tickets");
    let { d } = await draft(
      s,
      "Solicito a instalação do editor Zettlr para organizar anotações de trabalho. Só eu vou usar. Consigo trabalhar normalmente, não há compromisso em risco hoje e não uso uma alternativa provisória.",
      "É uma melhoria individual sem bloqueio e sem compromisso hoje; não há alternativa provisória em uso.",
    );
    check(
      "Requisição sem urgência tem prioridade baixa",
      d.payload.kind === "REQ" && d.payload.priority === "LOW",
    );
    d = await edit(
      s,
      d,
      "Instalação do Zettlr para anotações",
      d.payload.description +
        "\nJustificativa revisada: organização de anotações técnicas.",
    );
    await cancel(s, d);
    check(
      "Cancelar preserva a quantidade de chamados",
      (await api(s, "/tickets")).length === before.length,
    );
    const denied = await s.context.request.get(base + "/api/tickets/INC-20888");
    check("API nega protocolo de outro funcionário", denied.status() === 404);
    h = await send(
      s,
      "Qual é o status do chamado INC-20888?",
      "privacidade-protocolo",
    );
    check(
      "Chat não expõe assunto de outro funcionário",
      !h.messages.at(-1).content.includes("Notebook lento") &&
        !h.messages
          .at(-1)
          .data.tickets?.some((item) => item.code === "INC-20888"),
    );
  });
  await runScenario(plan[2], async (s) => {
    if (!shared.flux) {
      const { d } = await draft(
        s,
        "Preciso instalar o FluxogramaQA para desenhar diagramas de processos do laboratório. Não está no portal de softwares. Só eu preciso dele, consigo continuar trabalhando, não há compromisso hoje e não tenho solução provisória.",
        "Instalação individual do FluxogramaQA para diagramas de processos, sem bloqueio do trabalho, sem compromisso hoje e sem alternativa provisória.",
      );
      requireThat(
        d.operation === "CREATE",
        "FluxogramaQA deve ter um protocolo novo nesta rodada.",
      );
      shared.flux = await confirm(s, d, true);
    }
    let h = await history(s);
    if (h.state === "WAITING_ANALYST") h = await claim(s);
    if (h.state === "HUMAN_ACTIVE" && h.analyst_id === sessions.n1.user.id)
      await transfer(s, sessions.n1, sessions.n2, shared.flux);
    if ((await history(s)).state !== "CLOSED") {
      await send(
        s,
        "Recebi a informação do encaminhamento; vou aguardar o N2.",
        "funcionario-com-n2",
      );
      await analystMessage(
        s,
        sessions.n2,
        "Recebi o histórico e vou concluir a validação da solicitação de software.",
      );
    }
    await finish(
      s,
      shared.flux,
      sessions.n2,
      "Solicitação de FluxogramaQA encaminhada e validada",
    );
    shared.fluxSnapshot = await api(s, `/tickets/${shared.flux.id}`);
  });
  await runScenario(plan[3], async (s) => {
    const previousDraft = pending(await history(s));
    if (
      resume &&
      previousDraft &&
      shared.flux &&
      !previousDraft.payload.duplicate_review?.candidates.some(
        (candidate) => candidate.id === shared.flux.id,
      )
    ) {
      await cancel(s, previousDraft);
      record({
        tipo: "automacao",
        etapa: "revisao-apos-preparacao-do-candidato",
        motivo:
          "O rascunho anterior à retomada foi produzido antes da confirmação do FluxogramaQA; os candidatos serão reavaliados nesta mesma conversa.",
      });
    }
    const { d } = await draft(
      s,
      "Agora preciso instalar o QGIS para elaborar mapas geológicos do laboratório. Não quero FluxogramaQA: é outro programa e outra finalidade. Não está no portal. Só eu preciso, consigo trabalhar por enquanto, sem compromisso em risco hoje e sem alternativa provisória.",
      "É QGIS para mapas geológicos, um novo pedido distinto do FluxogramaQA. Impacto individual, sem bloqueio e sem compromisso hoje.",
    );
    check(
      "QGIS não é associado a FluxogramaQA",
      d.operation === "CREATE" && !d.target_id,
    );
    requireThat(
      d.operation === "CREATE",
      "Não confirmar um alvo de software incorreto.",
    );
    shared.qgis = await confirm(s, d);
    shared.qgisConversation = s.id;
    if (shared.flux) {
      const flux = await api(s, `/tickets/${shared.flux.id}`);
      check(
        "Histórico do FluxogramaQA permanece intacto",
        flux.version === shared.fluxSnapshot.version &&
          flux.description === shared.fluxSnapshot.description,
      );
    }
  });
  await runScenario(plan[4], async (s) => {
    requireThat(
      shared.qgis,
      "Depende da criação do QGIS na conversa anterior.",
    );
    let { d } = await draft(
      s,
      "Quero continuar aquela solicitação de disponibilizar o QGIS no computador do laboratório para produzir mapas geológicos. É a mesma instalação que pedi, não um segundo pedido. Só eu uso, continuo trabalhando, sem compromisso em risco hoje e sem alternativa provisória.",
      "É a mesma instalação do QGIS para mapas geológicos, individual e sem urgência.",
      shared.qgis,
    );
    const matched = d.operation === "UPDATE" && d.target_id === shared.qgis.id;
    check("Mesmo QGIS com outro relato usa o protocolo existente", matched, {
      operacao: d.operation,
      alvo: d.target_code,
    });
    if (!matched) {
      await cancel(s, d);
      await send(
        s,
        `Quero consultar o chamado ${shared.qgis.code}.`,
        "selecionar-protocolo-explicito",
      );
      ({ d } = await draft(
        s,
        "Adicionar informação: a instalação do QGIS é necessária para mapas geológicos do laboratório.",
        "É um complemento do mesmo pedido de QGIS.",
        shared.qgis,
      ));
    }
    requireThat(
      d.target_id === shared.qgis.id,
      "Não confirmar complemento no protocolo errado.",
    );
    await confirm(s, d);
    await finish(
      s,
      shared.qgis,
      sessions.n1,
      "Mesmo pedido do QGIS validado sem criar duplicata",
    );
    // Encerra o contato anterior que também apontava para o protocolo agora resolvido.
    const previous = { ...s, id: shared.qgisConversation };
    await finish(previous, shared.qgis, sessions.n1);
  });
  await runScenario(plan[5], async (s) => {
    let h = await send(
      s,
      "A impressora térmica Zebra do laboratório não imprime etiquetas. Ainda não sei se afeta só a mim ou outras pessoas. Podemos conferir o alcance antes de abrir o chamado?",
      "alcance-desconhecido",
    );
    check(
      "Impacto desconhecido é esclarecido antes do rascunho",
      h.state === "AGENT_ACTIVE" && !pending(h),
    );
    let d;
    ({ d } = await draft(
      s,
      "Só eu sou afetada. Posso usar a impressora da recepção e continuar trabalhando. Não há compromisso em risco hoje.",
      "Alcance individual, alternativa na recepção, sem bloqueio e sem compromisso hoje.",
    ));
    check(
      "Rascunho incorpora alcance e alternativa",
      d.payload.affected_scope === "individual" &&
        d.payload.priority === "MEDIUM" &&
        d.payload.description.toLowerCase().includes("recepção"),
    );
    const ticket = await confirm(s, d);
    await claim(s);
    h = await history(s);
    const refused = await sessions.n1.context.request.post(
      base + `/api/analyst/conversations/${s.id}/close`,
      { data: { epoch: h.epoch } },
    );
    check(
      "Chamado aberto impede encerramento e preserva responsável",
      refused.status() === 409 &&
        (await history(s)).analyst_id === sessions.n1.user.id,
    );
    await transfer(s, sessions.n1, sessions.n2, ticket, true);
    await send(
      s,
      "Obrigada, vou aguardar a análise da impressora.",
      "ia-pausada-impressora",
    );
    await finish(
      s,
      ticket,
      sessions.n2,
      "Alcance e alternativa da impressora registrados",
    );
  });
  await runScenario(plan[6], async (s) => {
    let h = await send(
      s,
      "O Outlook do meu computador não sincroniza desde ontem. Quero tentar a orientação da central de ajuda antes de abrir um incidente.",
      "orientacao-outlook",
    );
    check(
      "Outlook recebe orientação aplicável",
      h.messages
        .at(-1)
        .data.decision.sources.some(
          (item) => item.id === "outlook" && item.applicable,
        ),
    );
    const { d } = await draft(
      s,
      "Já conferi a conexão, reiniciei o Outlook e verifiquei a caixa de saída, mas continua sem sincronizar. Só eu sou afetada. Consigo trabalhar pelo webmail e não há compromisso em risco hoje.",
      "A orientação não resolveu. Impacto individual, consigo trabalhar pelo webmail, sem compromisso hoje.",
    );
    check(
      "Falha persistente com alternativa gera incidente médio",
      d.payload.kind === "INC" && d.payload.priority === "MEDIUM",
    );
    const ticket = await confirm(s, d);
    await claim(s);
    await analystMessage(
      s,
      sessions.n1,
      "Li as tentativas realizadas e vou continuar a análise sem repetir a orientação inicial.",
    );
    await finish(
      s,
      ticket,
      sessions.n1,
      "Tentativa sem sucesso e alternativa pelo webmail registradas",
    );
  });
  await runScenario(plan[7], async (s) => {
    let { d } = await draft(
      s,
      "Preciso de acesso à pasta /Laboratorio/Mapas2026 no SharePoint para uma reunião hoje. É uma nova pasta, diferente da pasta Financeiro. Só eu preciso desse acesso. Consigo continuar outras tarefas, mas a reunião está em risco e não há alternativa para acessar os documentos.",
      "Impacto individual, continuo trabalhando em outras tarefas, reunião em risco hoje e sem alternativa de acesso.",
    );
    check(
      "Acesso para reunião hoje tem prioridade alta",
      d.payload.kind === "REQ" && d.payload.priority === "HIGH",
    );
    requireThat(
      d.operation === "CREATE",
      "A pasta do laboratório não pode alterar um protocolo da pasta Financeiro.",
    );
    const ticket = await confirm(s, d);
    await claim(s);
    await analystMessage(
      s,
      sessions.n1,
      "Recebi o pedido de acesso à pasta do laboratório e estou verificando a permissão.",
    );
    const anchor = (await api(s, `/tickets/${ticket.id}`)).support_updated_at;
    await release(s);
    await send(
      s,
      "Tenho mais informações para acrescentar ao chamado.",
      "anuncio-sem-conteudo",
    );
    const announced = await history(s);
    check("Anúncio sem conteúdo pede o relato", !pending(announced));
    ({ d } = await draft(
      s,
      "A reunião foi cancelada. Não há outro compromisso em risco hoje. Continuo trabalhando normalmente e recebi uma cópia autorizada dos documentos como alternativa provisória; ainda preciso do acesso à mesma pasta.",
      "Continuo trabalhando, sem compromisso em risco hoje, com alternativa provisória autorizada.",
    ));
    check(
      "Correção dos fatos propõe reduzir para média",
      d.payload.priority === "MEDIUM" &&
        d.payload.priority_review?.proposed === "MEDIUM",
    );
    d = await edit(
      s,
      d,
      d.payload.title,
      d.payload.description +
        "\nComplemento revisado: manter a solicitação de permissão para a mesma pasta.",
    );
    await confirm(s, d);
    check(
      "Complemento não falsifica a data de resposta do suporte",
      (await api(s, `/tickets/${ticket.id}`)).support_updated_at === anchor,
    );
    await claim(s);
    await release(s);
    ({ d } = await draft(
      s,
      "A reunião foi remarcada para hoje e a cópia dos documentos não serve mais. Preciso do acesso à mesma pasta para esse compromisso. Só eu sou afetada; consigo continuar outras tarefas, mas essa reunião está em risco e não há alternativa para ela.",
      "Tenho compromisso em risco hoje na mesma pasta. Continuo trabalhando em outras tarefas, mas não há alternativa para os documentos dessa reunião.",
    ));
    check(
      "Novo compromisso eleva novamente para alta",
      d.payload.priority === "HIGH" &&
        d.payload.priority_review?.proposed === "HIGH",
    );
    await confirm(s, d);
    check(
      "Elevação também preserva a âncora do suporte",
      (await api(s, `/tickets/${ticket.id}`)).support_updated_at === anchor,
    );
    await finish(
      s,
      ticket,
      sessions.n1,
      "Prioridade revista com base em reunião cancelada e alternativa",
    );
  });
  await runScenario(plan[8], async (s) => {
    requireThat(shared.qgis, "Depende do protocolo QGIS da rodada.");
    await send(
      s,
      `Qual é o status do chamado ${shared.qgis.code}?`,
      "consulta-resolvido",
    );
    let { d } = await draft(
      s,
      "O problema voltou no mesmo QGIS do laboratório: depois da instalação ele não abre mais, e agora não consigo preparar os mapas geológicos. Só eu sou afetado, sem alternativa para continuar.",
      "É o mesmo QGIS; agora bloqueia o trabalho individual e não há alternativa.",
      shared.qgis,
    );
    check(
      "Mesmo problema resolvido propõe reabertura",
      d.operation === "REOPEN" && d.target_id === shared.qgis.id,
    );
    requireThat(
      d.operation === "REOPEN" && d.target_id === shared.qgis.id,
      "Reabertura deve preservar o protocolo QGIS.",
    );
    const original = await api(s, `/tickets/${shared.qgis.id}`);
    await cancel(s, d);
    check(
      "Cancelar reabertura preserva o resolvido",
      (await api(s, `/tickets/${shared.qgis.id}`)).status === "RESOLVED",
    );
    ({ d } = await draft(
      s,
      "Confirmo que o mesmo problema do QGIS voltou. Quero tentar a reabertura novamente: ele não abre e bloqueia meu trabalho com mapas, só eu, sem alternativa.",
      "Mesmo QGIS, bloqueio individual, sem alternativa.",
      shared.qgis,
    ));
    requireThat(
      d.operation === "REOPEN" && d.target_id === shared.qgis.id,
      "Nova tentativa deve continuar sendo reabertura.",
    );
    await confirm(s, d);
    await finish(
      s,
      shared.qgis,
      sessions.n1,
      "Segunda solução simulada após reabertura do QGIS",
    );
    const final = await api(s, `/tickets/${shared.qgis.id}`);
    check(
      "Reabertura preserva soluções anteriores",
      final.updates.filter((item) => item.type === "resolution").length ===
        original.updates.filter((item) => item.type === "resolution").length +
          1 && final.updates.some((item) => item.type === "reopen"),
    );
    await openAnalyst(sessions.n1, s, shared.qgis);
    await sessions.n1.page.setViewportSize({ width: 390, height: 844 });
    await sessions.n1.page
      .getByRole("button", { name: "Mostrar chamados", exact: true })
      .click();
    const panel = sessions.n1.page
      .locator(".side-ticket")
      .filter({ hasText: shared.qgis.code });
    await expect(panel.locator(".ticket-solution")).toBeVisible();
    check(
      "Painel resolvido mostra solução e data sem prazo futuro",
      (await panel.locator(".deadline").innerText()).includes("Resolvido em") &&
        (await panel.locator(".ticket-solution").innerText()).includes(
          "Segunda solução simulada",
        ),
    );
    await shot(sessions.n1, "solucao-no-painel", true);
  });
  await runScenario(plan[9], async (s) => {
    const { h, d } = await draft(
      s,
      "Toda a equipe do laboratório está sem rede desde que o switch apagou. Os computadores são Windows 11. Ninguém consegue acessar nenhum sistema nem continuar trabalhando, e não existe alternativa. Precisamos de atendimento urgente.",
      "Toda a equipe está completamente impedida de trabalhar na rede, sem alternativa, Windows 11.",
    );
    check(
      "Crítico entra na fila antes da confirmação",
      h.state === "WAITING_ANALYST" &&
        h.handoff_reason === "CRITICAL" &&
        h.selected_ticket_id === null &&
        d.payload.priority === "CRITICAL",
    );
    await claim(s);
    await openEmployee(s);
    await expect(
      s.page.getByRole("button", { name: "Confirmar", exact: true }),
    ).toBeDisabled();
    const denied = await s.context.request.post(
      base + `/api/drafts/${d.id}/confirm`,
      { data: { revision: d.revision } },
    );
    check("Assunção bloqueia confirmação pendente", denied.status() === 409);
    await transfer(s, sessions.n1, sessions.n2, null);
    await send(
      s,
      "Vou aguardar o N2; a equipe continua sem conseguir trabalhar.",
      "critico-ia-pausada",
    );
    await release(s, sessions.n2);
    await expect(
      s.page.getByRole("button", { name: "Confirmar", exact: true }),
    ).toBeEnabled();
    const ticket = await confirm(s, pending(await history(s)));
    await finish(
      s,
      ticket,
      sessions.n2,
      "Incidente crítico e passagem humana validados",
    );
  });

  for (const key of ["ana", "carla", "bruno"])
    report.final[key] = {
      tickets: await api(sessions[key], "/tickets"),
      conversas: await api(sessions[key], "/conversations"),
    };
  const originalIds = new Set(
    Object.values(report.baseline).flatMap((item) =>
      item.tickets.map((ticket) => ticket.id),
    ),
  );
  const unchanged = Object.values(report.baseline).every((snapshot) =>
    snapshot.tickets.every((before) => {
      const after = Object.values(report.final)
        .flatMap((entry) => entry.tickets || [])
        .find((ticket) => ticket.id === before.id);
      return JSON.stringify(before) === JSON.stringify(after);
    }),
  );
  report.preservacao_baseline = {
    chamados_anteriores_inalterados: unchanged,
    ids_anteriores: [...originalIds],
    protocolos_criados: [...createdTickets],
  };
  const interactions = report.eventos.filter(
    (event) => event.tipo === "interacao_ia",
  );
  const times = interactions
    .filter((event) => event.decisao?.duration_ms !== undefined)
    .map((event) => event.decisao.duration_ms)
    .sort((a, b) => a - b);
  const median = times.length
    ? (times[Math.floor((times.length - 1) / 2)] +
        times[Math.floor(times.length / 2)]) /
      2
    : null;
  report.metricas = {
    conversas: report.conversas.length,
    tentativas_ia: report.tentativas_ia,
    decisoes_live: interactions.filter(
      (event) => event.decisao?.mode === "live",
    ).length,
    erros_ia: interactions.filter((event) => event.erro || !event.decisao)
      .length,
    latencia_min_ms: times[0],
    latencia_mediana_ms: median,
    latencia_max_ms: times.at(-1),
    tokens_entrada: interactions.reduce(
      (sum, event) => sum + (event.decisao?.usage?.input_tokens || 0),
      0,
    ),
    tokens_saida: interactions.reduce(
      (sum, event) => sum + (event.decisao?.usage?.output_tokens || 0),
      0,
    ),
    verificacoes: report.verificacoes.length,
    verificacoes_falhas: report.verificacoes.filter((item) => !item.passou)
      .length,
    cenarios_passaram: plan.filter(
      ([id]) => report.final[id]?.resultado === "PASSOU",
    ).length,
  };
  report.fim_utc = new Date().toISOString();
  save();
  writeFileSync(
    path.join(output, "metricas.json"),
    JSON.stringify(report.metricas, null, 2),
  );
  const rows = plan
    .map(
      ([id, , title]) =>
        `| ${id} | ${title} | ${report.final[id]?.resultado || "NÃO EXECUTADO"} |`,
    )
    .join("\n");
  const failures = report.verificacoes
    .filter((item) => !item.passou)
    .map((item) => `- ${item.cenario}: ${item.verificacao}`)
    .join("\n");
  writeFileSync(
    path.join(output, "relatorio.md"),
    `# Auditoria real de dez conversas\n\nRodada: ${runId}. Modelo real, sem fallback. Soluções de infraestrutura são simuladas; nenhuma instalação ou reparo real foi executado.\n\n| Conversa | Fluxo | Resultado |\n| --- | --- | --- |\n${rows}\n\n## Métricas\n\n\x60\x60\x60json\n${JSON.stringify(report.metricas, null, 2)}\n\x60\x60\x60\n\n## Verificações que falharam\n\n${failures || "Nenhuma."}\n\nProtocolos anteriores inalterados: ${unchanged ? "sim" : "não; conferir resultados.json"}. Evidências e diálogos completos em resultados.json e arquivos por conversa.\n`,
  );
  console.log(
    JSON.stringify({
      concluido: true,
      output,
      metricas: report.metricas,
      baseline_preservada: unchanged,
    }),
  );
}
main()
  .catch((error) => {
    report.falha_execucao = error.message;
    save();
    console.error(JSON.stringify({ falha_execucao: error.message, output }));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
  });
