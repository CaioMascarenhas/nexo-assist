import { expect, test, type Page } from "@playwright/test";

async function start(page: Page, email: string) {
  const auth = await page.request.post("/api/auth/login", {
    data: { email, password: "demo" },
  });
  expect(auth.ok()).toBeTruthy();
  const created = await page.request.post("/api/conversations", { data: {} });
  expect(created.status()).toBe(200);
  const conv = await created.json();
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeEnabled();
  return conv.id as string;
}
async function send(page: Page, content: string) {
  await page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill(content);
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator(".streaming")).toHaveCount(0);
}

test("login inválido, perfil e saída preservam a autorização", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "tmp/screenshots/tela-1-login.png" });
  await page.getByLabel("E-mail corporativo").fill("desconhecido@nexo.com.br");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "E-mail não cadastrado" }),
  ).toBeVisible();
  await page.getByLabel("E-mail corporativo").fill("ana.souza@nexo.com.br");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("button", { name: "Meu perfil", exact: true }).click();
  await expect(page.locator(".profile")).toContainText("ana.souza@nexo.com.br");
  await expect(page.locator(".profile")).toContainText("Alterada há 42 dias");
  await expect(page.locator(".profile-password-helper")).toHaveText(
    "Enviaremos um link de redefinição para ana.souza@nexo.com.br.",
  );
  await expect(page.locator(".new-conversation")).toHaveCount(0);
  await expect(page.locator(".header-status")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Redefinir senha", exact: true })
    .click();
  await expect(page.locator(".profile-password")).toBeVisible();
  await page.screenshot({ path: "tmp/screenshots/tela-6-perfil.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Redefinir senha", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "tmp/screenshots/perfil-celular.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/tickets")).status()).toBe(401);
});

test("dúvida e assunto fora de TI não criam chamados", async ({ page }) => {
  await start(page, "bruno.tavares@nexo.com.br");
  const before = await (await page.request.get("/api/tickets")).json();
  await send(page, "Qual é o horário do service desk?");
  await expect(page.locator(".timeline")).toContainText("das 8h às 18h");
  await send(page, "Quero consultar minhas férias no RH");
  await expect(page.locator(".timeline")).toContainText(
    "canal responsável da Nexo",
  );
  const after = await (await page.request.get("/api/tickets")).json();
  expect(after.length).toBe(before.length);
});

test("orientação de VPN sem resultado prepara rascunho e permite cancelar", async ({
  page,
}) => {
  await start(page, "bruno.tavares@nexo.com.br");
  await send(page, "Minha VPN tem erro 809 no Windows 10");
  await expect(page.locator(".timeline")).toContainText(
    "reinstale o cliente VPN",
  );
  await send(page, "Continua sem funcionar");
  await expect(page.locator(".message-text").last()).toContainText(
    "Quem está sendo afetado",
  );
  await send(page, "Só eu");
  await expect(page.locator(".message-text").last()).toContainText(
    "impede você de trabalhar",
  );
  await send(page, "Não consigo trabalhar");
  await expect(page.locator(".draft-card")).toContainText("Alta");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.locator(".draft-card")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".draft-card")).toHaveCount(0);
});

test("revisão e confirmação criam uma requisição e permitem complemento sem duplicar", async ({
  page,
}) => {
  await start(page, "bruno.tavares@nexo.com.br");
  const marker = Date.now();
  const content = `Quero um software Vetor ${marker}. Só eu, sem urgência.`;
  const before = await (await page.request.get("/api/tickets")).json();
  await send(page, content);
  await expect(page.locator(".draft-card")).toContainText("Requisição");
  expect((await (await page.request.get("/api/tickets")).json()).length).toBe(
    before.length,
  );
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page
    .getByLabel("Título", { exact: true })
    .fill(`Software Vetor ${marker}`);
  await page
    .getByRole("textbox", { name: "Descrição", exact: true })
    .fill("Preciso do software de desenho para preparar propostas.");
  await page
    .getByRole("button", { name: "Salvar revisão", exact: true })
    .click();
  await expect(page.locator(".draft-card")).toContainText(
    "Preciso do software de desenho",
  );
  await page.screenshot({ path: "tmp/screenshots/tela-2-rascunho.png" });
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(
    page.getByText("Aguardando um analista", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".draft-card")).toHaveCount(0);
  await expect(page.locator(".ticket-card").last()).toContainText("REQ-");
  await page.screenshot({ path: "tmp/screenshots/tela-2-abertura.png" });
  await page.reload();
  const after = await (await page.request.get("/api/tickets")).json();
  expect(after.length).toBe(before.length + 1);
  const created = after.find((item: { title: string }) =>
    item.title.includes(`Vetor ${marker}`),
  );
  expect(created.kind).toBe("REQ");
  await start(page, "bruno.tavares@nexo.com.br");
  await send(page, content);
  await expect(page.locator(".draft-card")).toContainText("Atualizar chamado");
  await expect(page.locator(".draft-card")).toContainText(created.code);
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.locator(".timeline")).toContainText(
    `Chamado ${created.code}: operação confirmada`,
  );
  await expect(page.locator(".draft-card")).toHaveCount(0);
  expect((await (await page.request.get("/api/tickets")).json()).length).toBe(
    after.length,
  );
});

test("consulta, complemento e reabertura exigem confirmação e preservam o protocolo", async ({
  page,
}) => {
  await start(page, "ana.souza@nexo.com.br");
  await send(page, "Qual o status do INC-20298?");
  await expect(page.locator(".ticket-card").last()).toContainText("INC-20298");
  await send(page, "Adicionar informação");
  await expect(page.locator(".message-text").last()).toContainText(
    "Qual informação",
  );
  await send(page, "A pasta apresenta erro de permissão desde ontem.");
  await expect(page.locator(".draft-card")).toContainText("INC-20298");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.locator(".timeline")).toContainText(
    "Chamado INC-20298: operação confirmada",
  );
  await expect(page.locator(".draft-card")).toHaveCount(0);
  await start(page, "ana.souza@nexo.com.br");
  await send(page, "Consultar meus chamados");
  await expect(
    page.locator(".message-tickets").last().locator(".ticket-list-item"),
  ).toHaveCount(3);
  await send(page, "Ver chamados resolvidos");
  await page
    .locator(".message-tickets")
    .last()
    .getByRole("button")
    .filter({ hasText: "INC-20150" })
    .click();
  await expect(page.locator(".message-text").last()).toContainText(
    "já foi resolvido",
  );
  await send(page, "O problema voltou");
  await expect(page.locator(".draft-card")).toContainText("Reabrir chamado");
  const beforeReopen = await (
    await page.request.get("/api/tickets/INC-20150")
  ).json();
  expect(beforeReopen.status).toBe("RESOLVED");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.locator(".timeline")).toContainText(
    "Chamado INC-20150: operação confirmada",
  );
  await expect(page.locator(".draft-card")).toHaveCount(0);
  const ticket = await (
    await page.request.get("/api/tickets/INC-20150")
  ).json();
  expect(ticket.status).toBe("WAITING_ANALYST");
  expect(ticket.resolved_at).toBeNull();
});

for (const [name, email, content] of [
  ["vencimento", "ana.souza@nexo.com.br", "Qual o status do INC-20311?"],
  [
    "criticidade",
    "carla.mendes@nexo.com.br",
    "A minha equipe inteira está parada, não consegue trabalhar na rede",
  ],
  ["baixa segurança", "bruno.tavares@nexo.com.br", "Não sei"],
]) {
  test(`transferência por ${name} pausa o assistente`, async ({ page }) => {
    const id = await start(page, email);
    await send(page, content);
    await expect(
      page.getByText("Aguardando um analista", { exact: true }),
    ).toBeVisible();
    if (name === "vencimento")
      await page.screenshot({ path: "tmp/screenshots/tela-3-consulta.png" });
    const before = await (
      await page.request.get(`/api/conversations/${id}`)
    ).json();
    await send(page, "Vou aguardar o suporte.");
    const after = await (
      await page.request.get(`/api/conversations/${id}`)
    ).json();
    expect(after.turns).toBe(before.turns);
    expect(
      after.messages.filter((m: { role: string }) => m.role === "AGENT").length,
    ).toBe(
      before.messages.filter((m: { role: string }) => m.role === "AGENT")
        .length,
    );
  });
}

test("chamado aberto impede encerramento e mantém o analista responsável", async ({
  browser,
}) => {
  const employee = await browser.newContext();
  const support = await browser.newContext();
  const page = await employee.newPage();
  const consolePage = await support.newPage();
  const id = await start(page, "carla.mendes@nexo.com.br");
  await send(page, "Qual o status do INC-20888?");
  await page
    .getByRole("button", { name: "Falar com um analista", exact: true })
    .last()
    .click();
  await support.request.post("/api/auth/login", {
    data: { email: "rafael.lima@nexo.com.br", password: "demo" },
  });
  await consolePage.goto("/");
  await consolePage
    .getByRole("button", { name: "Para você", exact: true })
    .click();
  await consolePage
    .locator(".conversation-row")
    .filter({ hasText: "Carla Mendes" })
    .first()
    .click();
  await consolePage
    .getByRole("button", { name: "Assumir atendimento", exact: true })
    .click();
  await consolePage
    .getByRole("button", { name: "Minhas", exact: true })
    .click();
  await expect(consolePage.locator(".conversation-row").first()).toContainText(
    "Você está atendendo",
  );
  await expect(
    consolePage.getByRole("button", {
      name: "Encerrar atendimento",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(consolePage.getByRole("status")).toContainText(
    "O acompanhamento permanece com você em Minhas.",
  );
  await expect(
    page
      .locator(".workspace-header")
      .getByText("Analista atendendo", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeEnabled();
  const current = await (
    await page.request.get(`/api/conversations/${id}`)
  ).json();
  expect(current.state).toBe("HUMAN_ACTIVE");
  expect(current.analyst_id).toBeTruthy();
  const ticket = await (
    await page.request.get("/api/tickets/INC-20888")
  ).json();
  expect(ticket.status).not.toBe("RESOLVED");
  await employee.close();
  await support.close();
});

test("erro de envio libera o campo e não expõe chamados de outro funcionário", async ({
  page,
}) => {
  await start(page, "carla.mendes@nexo.com.br");
  expect((await page.request.get("/api/tickets/INC-20311")).status()).toBe(404);
  expect((await page.request.get("/api/conversations/demo-ana")).status()).toBe(
    404,
  );
  await page.route("**/api/conversations/*/messages", (route) =>
    route.fulfill({
      status: 503,
      json: {
        detail: "Serviço temporariamente indisponível. Tente novamente.",
      },
    }),
  );
  await send(page, "Preciso de ajuda");
  await expect(
    page.getByRole("alert").filter({ hasText: "temporariamente indisponível" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeEnabled();
});
