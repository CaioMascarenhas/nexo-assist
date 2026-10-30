import { expect, test, type Page } from "@playwright/test";

async function start(page: Page, email: string) {
  expect(
    (
      await page.request.post("/api/auth/login", {
        data: { email, password: "demo" },
      })
    ).ok(),
  ).toBeTruthy();
  const response = await page.request.post("/api/conversations", { data: {} });
  expect(response.ok()).toBeTruthy();
  const conversation = await response.json();
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeEnabled();
  return conversation.id as string;
}

async function send(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Mensagem", exact: true }).fill(text);
  await page
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(page.locator(".streaming")).toHaveCount(0);
}

test("resolução após orientação não repete o artigo nem abre chamado", async ({
  page,
}) => {
  await start(page, "carla.mendes@nexo.com.br");
  const before = await (await page.request.get("/api/tickets")).json();
  await send(page, "Minha VPN mostra erro 809 no Windows 10");
  await expect(page.locator(".message-text").last()).toContainText("reinstale");
  await send(
    page,
    "Reinstalei e reiniciei. A VPN voltou a funcionar, está resolvido. Não preciso de chamado.",
  );
  await expect(page.locator(".message-text").last()).toContainText(
    "Que bom que voltou a funcionar",
  );
  await expect(page.locator(".message-text").last()).not.toContainText(
    "reinstale",
  );
  expect((await (await page.request.get("/api/tickets")).json()).length).toBe(
    before.length,
  );
  await page.screenshot({
    path: "tmp/screenshots/regressao-orientacao-resolvida.png",
  });
});

test("incidente crítico entra na fila mas só recebe protocolo após confirmar", async ({
  page,
}) => {
  const id = await start(page, "bruno.tavares@nexo.com.br");
  await send(
    page,
    "A VPN não conecta no Windows 11 para minha equipe inteira. Todos estão parados e não consigo trabalhar, sem alternativa.",
  );
  await expect(
    page.getByText("Aguardando um analista", { exact: true }),
  ).toBeVisible();
  const history = await (
    await page.request.get(`/api/conversations/${id}`)
  ).json();
  expect(history.handoff_reason).toBe("CRITICAL");
  expect(history.selected_ticket_id).toBeNull();
  await expect(page.locator(".draft-card")).toContainText("Crítica");
  await expect(
    page.getByRole("button", { name: "Confirmar", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.locator(".draft-card")).toHaveCount(0);
  const confirmed = await (
    await page.request.get(`/api/conversations/${id}`)
  ).json();
  expect(confirmed.selected_ticket_id).toBeTruthy();
  const ticket = await (
    await page.request.get(`/api/tickets/${confirmed.selected_ticket_id}`)
  ).json();
  expect(ticket.priority).toBe("CRITICAL");
  expect(ticket.status).toBe("WAITING_ANALYST");
  await expect(page.locator(".ticket-card").last()).toContainText(ticket.code);
  await page.screenshot({
    path: "tmp/screenshots/regressao-critico-com-protocolo.png",
  });
});

test("analista registra solução, resolve o chamado e encerra a conversa separadamente", async ({
  browser,
}) => {
  const employee = await browser.newContext();
  const support = await browser.newContext();
  const page = await employee.newPage();
  const consolePage = await support.newPage();
  const id = await start(page, "bruno.tavares@nexo.com.br");
  await send(
    page,
    `Notebook do laboratório QA não liga ${Date.now()}. Só eu, não consigo trabalhar.`,
  );
  await expect(page.locator(".draft-card")).toContainText(
    "Aguardando confirmação",
  );
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(
    page.getByText("Aguardando um analista", { exact: true }),
  ).toBeVisible();
  const history = await (
    await page.request.get(`/api/conversations/${id}`)
  ).json();
  const ticket = await (
    await page.request.get(`/api/tickets/${history.selected_ticket_id}`)
  ).json();
  await support.request.post("/api/auth/login", {
    data: { email: "luiza.costa@nexo.com.br", password: "demo" },
  });
  await consolePage.goto("/");
  await consolePage
    .getByLabel("Pesquisar conversa ou chamado")
    .fill(ticket.code);
  await consolePage.locator(".conversation-row").first().click();
  await consolePage
    .getByRole("button", { name: "Assumir atendimento", exact: true })
    .click();
  await consolePage
    .getByRole("button", { name: "Resolver chamado", exact: true })
    .click();
  await consolePage
    .getByRole("textbox", { name: "Solução aplicada", exact: true })
    .fill("Fonte substituída e funcionamento validado com o funcionário.");
  await consolePage
    .getByRole("button", { name: "Registrar solução", exact: true })
    .click();
  await expect(consolePage.locator(".resolution-form")).toHaveCount(0);
  await expect(page.locator(".timeline")).toContainText(
    `Chamado ${ticket.code} resolvido`,
  );
  expect(
    (await (await page.request.get(`/api/tickets/${ticket.id}`)).json()).status,
  ).toBe("RESOLVED");
  expect(
    (await (await page.request.get(`/api/conversations/${id}`)).json()).state,
  ).toBe("HUMAN_ACTIVE");
  await consolePage
    .getByRole("button", { name: "Encerrar atendimento", exact: true })
    .click();
  await expect(
    consolePage.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toHaveAttribute("placeholder", "Atendimento encerrado");
  await expect(
    page.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeDisabled();
  await consolePage.screenshot({
    path: "tmp/screenshots/regressao-chamado-resolvido.png",
    fullPage: true,
  });
  await employee.close();
  await support.close();
});

test("rascunho crítico bloqueia confirmação após assunção e libera após devolução", async ({
  browser,
}) => {
  const employee = await browser.newContext();
  const support = await browser.newContext();
  const page = await employee.newPage();
  const consolePage = await support.newPage();
  const id = await start(page, "carla.mendes@nexo.com.br");
  const before = await (await page.request.get("/api/tickets")).json();
  await send(
    page,
    "A VPN não conecta no Windows 11 para minha equipe inteira. Estamos parados e não consigo trabalhar.",
  );
  await expect(
    page.getByRole("button", { name: "Confirmar", exact: true }),
  ).toBeEnabled();
  await support.request.post("/api/auth/login", {
    data: { email: "luiza.costa@nexo.com.br", password: "demo" },
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
  await expect(
    page.getByRole("button", { name: "Confirmar", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".draft-card")).toContainText(
    "O rascunho não foi efetivado",
  );
  expect((await (await page.request.get("/api/tickets")).json()).length).toBe(
    before.length,
  );
  await consolePage
    .getByRole("button", { name: "Devolver ao assistente", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmar", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.locator(".draft-card")).toHaveCount(0);
  expect(
    (await (await page.request.get(`/api/conversations/${id}`)).json())
      .selected_ticket_id,
  ).toBeTruthy();
  await employee.close();
  await support.close();
});

test("complemento de VPN preserva perda de alternativa e pergunta somente pelo bloqueio", async ({
  page,
}) => {
  await start(page, "bruno.tavares@nexo.com.br");
  const tickets = await (await page.request.get("/api/tickets")).json();
  const ticket = tickets.find(
    (item: { category: string; status: string }) =>
      item.category === "Rede e VPN" && item.status !== "RESOLVED",
  );
  expect(ticket).toBeTruthy();
  await send(page, `Qual o status do chamado ${ticket.code}?`);
  await expect(page.locator(".message-text").last()).toContainText(
    "status atualizado",
  );
  await send(page, "Adicionar informação");
  await expect(page.locator(".message-text").last()).toContainText(
    "Qual informação",
  );
  await send(page, "Agora eu não tenho mais alternativa");
  await expect(page.locator(".message-text").last()).toContainText(
    "Sem a alternativa",
  );
  await expect(page.locator(".draft-card")).toHaveCount(0);
  await send(page, "Não consigo trabalhar");
  await expect(page.locator(".draft-card")).toContainText(
    "Agora eu não tenho mais alternativa",
  );
  await expect(page.locator(".draft-card")).toContainText(
    "Não consigo trabalhar",
  );
  await expect(page.locator(".draft-card")).toContainText(ticket.code);
  const unchanged = await (
    await page.request.get(`/api/tickets/${ticket.id}`)
  ).json();
  expect(unchanged.description).toBe(ticket.description);
  await page.screenshot({
    path: "tmp/screenshots/regressao-complemento-vpn.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
});
