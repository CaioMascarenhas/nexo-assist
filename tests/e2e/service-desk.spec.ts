import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("E-mail corporativo").fill(email);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("employee confirms a draft and can inspect the decision", async ({
  page,
}) => {
  await login(page, "bruno.tavares@nexo.com.br");
  await expect(
    page.getByRole("button", { name: "Novo atendimento" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  await expect(
    page.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill(
      "Minha VPN tem erro 809 no Windows 11. Só eu sou afetado e não consigo trabalhar.",
    );
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Aguardando confirmação", { exact: true }),
  ).toBeVisible();
  await page.getByText("Entenda esta decisão").last().click();
  await expect(
    page.getByText("estimativa não calibrada", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(
    page.getByText(/operação confirmada e concluída/).last(),
  ).toBeVisible();
  await page.screenshot({
    path: "tmp/screenshots/employee-chat.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByText(/operação confirmada e concluída/).last(),
  ).toBeVisible();
});

test("analyst receives handoff and replies with the agent paused", async ({
  browser,
}) => {
  const employee = await browser.newContext();
  const support = await browser.newContext();
  const userPage = await employee.newPage();
  const analystPage = await support.newPage();
  await login(userPage, "carla.mendes@nexo.com.br");
  await userPage.getByRole("button", { name: "Novo atendimento" }).click();
  await expect(
    userPage.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeEnabled();
  await userPage
    .getByRole("button", { name: "Falar com um analista", exact: true })
    .last()
    .click();
  await expect(
    userPage.getByText("Aguardando um analista", { exact: true }),
  ).toBeVisible();
  await login(analystPage, "rafael.lima@nexo.com.br");
  await analystPage
    .getByRole("button", { name: "Para você", exact: true })
    .click();
  await analystPage
    .locator(".conversation-row")
    .filter({ hasText: "Carla Mendes" })
    .first()
    .click();
  await expect(
    analystPage.getByRole("button", { name: "Assumir atendimento" }),
  ).toBeVisible();
  await analystPage
    .getByRole("button", { name: "Assumir atendimento" })
    .click();
  await expect(
    analystPage.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeEnabled();
  await analystPage
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill("Olá, Carla. Já li o contexto e vou ajudar você.");
  await analystPage.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(
    userPage.getByText("Olá, Carla. Já li o contexto e vou ajudar você."),
  ).toBeVisible();
  await expect(
    userPage.getByText("Analista atendendo", { exact: true }),
  ).toBeVisible();
  await analystPage
    .getByRole("button", { name: "Devolver ao agent", exact: true })
    .click();
  await expect(
    userPage.getByText("Assistente online", { exact: true }),
  ).toBeVisible();
  await employee.close();
  await support.close();
});
