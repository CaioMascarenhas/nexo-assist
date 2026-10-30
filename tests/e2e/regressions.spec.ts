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

test("incidente crítico completo recebe protocolo antes da transferência", async ({
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
  expect(history.selected_ticket_id).toBeTruthy();
  const ticket = await (
    await page.request.get(`/api/tickets/${history.selected_ticket_id}`)
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
