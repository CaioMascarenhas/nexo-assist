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
