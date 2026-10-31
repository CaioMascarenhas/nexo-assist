import { expect, test } from "@playwright/test";

test("N1 encaminha diretamente para N2 e mantém o atendimento humano no mesmo protocolo", async ({
  browser,
}) => {
  const employee = await browser.newContext();
  const n1 = await browser.newContext();
  const n2 = await browser.newContext();
  try {
    for (const [context, email] of [
      [employee, "ana.souza@nexo.com.br"],
      [n1, "luiza.costa@nexo.com.br"],
      [n2, "rafael.lima@nexo.com.br"],
    ] as const) {
      expect(
        (
          await context.request.post("/api/auth/login", {
            data: { email, password: "demo" },
          })
        ).ok(),
      ).toBeTruthy();
    }
    const conversation = await (
      await employee.request.post("/api/conversations", { data: {} })
    ).json();
    expect(
      (
        await employee.request.post(
          `/api/conversations/${conversation.id}/handoff`,
        )
      ).ok(),
    ).toBeTruthy();
    // Vincula um protocolo próprio enquanto a IA já está pausada, sem consumir o modelo.
    expect(
      (
        await employee.request.post(
          `/api/conversations/${conversation.id}/messages`,
          {
            data: {
              content:
                "Preciso continuar o atendimento do acesso ao SharePoint.",
              client_id: "transfer-context",
              ticket_id: "INC-20298",
            },
          },
        )
      ).ok(),
    ).toBeTruthy();
    const employeePage = await employee.newPage();
    const n1Page = await n1.newPage();
    const n2Page = await n2.newPage();
    await employeePage.goto("/");
    await n1Page.goto("/");
    await n1Page.getByLabel("Pesquisar conversa ou chamado").fill("INC-20298");
    await n1Page.locator(".conversation-row").first().click();
    await n1Page
      .getByRole("button", { name: "Assumir atendimento", exact: true })
      .click();
    await expect(
      n1Page.getByRole("textbox", { name: "Mensagem", exact: true }),
    ).toBeEnabled();
    const before = await (
      await employee.request.get("/api/tickets/INC-20298")
    ).json();
    const reason =
      "Permissão do SharePoint requer análise especializada. Já conferi o endereço da pasta e o usuário afetado.";
    await n1Page
      .getByRole("button", { name: "Encaminhar atendimento", exact: true })
      .click();
    const form = n1Page.getByRole("form", {
      name: "Encaminhar atendimento",
      exact: true,
    });
    await expect(form).toBeVisible();
    await expect(
      form.getByRole("button", { name: "Confirmar encaminhamento" }),
    ).toBeDisabled();
    await form
      .getByLabel("Analista de destino")
      .selectOption({ label: "Rafael Lima · Suporte N2" });
    await form.getByLabel("Motivo do encaminhamento").fill(reason);
    await n1Page.screenshot({
      path: "tmp/screenshots/encaminhamento-n1-n2-desktop.png",
      fullPage: true,
    });
    await n1Page.setViewportSize({ width: 390, height: 844 });
    await expect(
      form.getByRole("button", { name: "Confirmar encaminhamento" }),
    ).toBeVisible();
    expect(
      await n1Page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await n1Page.screenshot({
      path: "tmp/screenshots/encaminhamento-n1-n2-mobile.png",
      fullPage: true,
    });
    await form
      .getByRole("button", { name: "Confirmar encaminhamento", exact: true })
      .click();
    await expect(form).toHaveCount(0);
    await expect(
      n1Page.getByRole("textbox", { name: "Mensagem", exact: true }),
    ).toBeDisabled();
    await expect(n1Page.locator(".assigned-banner")).toContainText(
      "Rafael Lima",
    );
    await expect(employeePage.locator(".assigned-banner")).toContainText(
      "Rafael Lima",
    );
    const transferred = await (
      await employee.request.get(`/api/conversations/${conversation.id}`)
    ).json();
    expect(transferred.state).toBe("HUMAN_ACTIVE");
    expect(transferred.analyst_id).toBe("rafael");
    expect(transferred.selected_ticket_id).toBe(before.id);
    const after = await (
      await employee.request.get("/api/tickets/INC-20298")
    ).json();
    expect(after.due_at).toBe(before.due_at);
    expect(after.support_updated_at).toBe(before.support_updated_at);
    expect(after.updates.at(-1).type).toBe("analyst_transfer");
    expect(after.updates.at(-1).content).toBe(reason);
    const previousMine = await (
      await n1.request.get("/api/analyst/conversations?filter=mine")
    ).json();
    expect(
      previousMine.some((item: { id: string }) => item.id === conversation.id),
    ).toBeFalsy();

    await n2Page.goto("/");
    await n2Page.getByRole("button", { name: "Minhas", exact: true }).click();
    await n2Page
      .locator(".conversation-row")
      .filter({ hasText: "Ana Souza" })
      .filter({ hasText: "Luiza Costa encaminhou" })
      .first()
      .click();
    await expect(
      n2Page.getByRole("textbox", { name: "Mensagem", exact: true }),
    ).toBeEnabled();
    await expect(
      n2Page.getByRole("button", { name: "Assumir atendimento", exact: true }),
    ).toHaveCount(0);
    await expect(n2Page.locator(".handoff-summary")).toContainText(reason);
    await expect(n2Page.locator(".timeline")).toContainText(
      "Luiza Costa encaminhou o atendimento para Rafael Lima",
    );
    await n2Page
      .getByRole("textbox", { name: "Mensagem", exact: true })
      .fill("Recebi o histórico da Luiza e vou continuar a análise do acesso.");
    await n2Page
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(employeePage.locator(".timeline")).toContainText(
      "Recebi o histórico da Luiza",
    );
    await employeePage
      .getByRole("textbox", { name: "Mensagem", exact: true })
      .fill("Obrigada, Rafael.");
    await employeePage
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(n2Page.locator(".timeline")).toContainText(
      "Obrigada, Rafael.",
    );
    const final = await (
      await employee.request.get(`/api/conversations/${conversation.id}`)
    ).json();
    expect(final.turns).toBe(transferred.turns);
    expect(final.state).toBe("HUMAN_ACTIVE");
    expect(final.analyst_id).toBe("rafael");
    await n2Page.screenshot({
      path: "tmp/screenshots/encaminhamento-n2-recebido.png",
      fullPage: true,
    });
  } finally {
    await employee.close();
    await n1.close();
    await n2.close();
  }
});
