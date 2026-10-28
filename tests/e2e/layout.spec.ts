import { expect, test } from "@playwright/test";

for (const width of [1920, 1366, 390]) {
  test(`funcionário pode ler e retomar atendimentos em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator(".timeline")).toBeVisible();
    const chat = await page.locator(".conversation-main").boundingBox();
    const timeline = await page.locator(".timeline-inner").boundingBox();
    expect(timeline!.width).toBeGreaterThan(chat!.width * 0.95);
    await expect(page.locator(".conversation-history")).not.toHaveAttribute(
      "open",
    );
    await page.getByLabel("Retomar atendimento", { exact: true }).click();
    await expect(page.locator(".history-options button").first()).toBeVisible();
    await page.locator(".history-options button").first().click();
    await expect(page.locator(".conversation-history")).not.toHaveAttribute(
      "open",
    );
    await expect(
      page.getByRole("textbox", { name: "Mensagem", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    expect(
      await page
        .locator(".message-text")
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(15);
    await page.screenshot({ path: `tmp/screenshots/funcionario-${width}.png` });
  });
}

test("analista acessa lista e chamados no celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("E-mail corporativo").fill("rafael.lima@nexo.com.br");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mostrar conversas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mostrar conversas" }).click();
  await expect(page.locator(".conversation-list")).toBeVisible();
  await page.locator(".conversation-row").first().click();
  await expect(page.locator(".conversation-list")).not.toBeVisible();
  await page.getByRole("button", { name: "Mostrar chamados" }).click();
  await expect(
    page.getByRole("complementary", { name: "Chamados do funcionário" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar chamados" }).click();
  await expect(
    page.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "tmp/screenshots/analista-celular.png" });
});
