import { expect, test } from "@playwright/test";

const user = {
  id: "ana",
  name: "Ana Souza",
  email: "ana.souza@nexo.com.br",
  role: "EMPLOYEE",
  department: "Financeiro",
};
function conversation(id: string) {
  return {
    id,
    user_id: user.id,
    user,
    state: "AGENT_ACTIVE",
    analyst_id: null,
    epoch: 0,
    turns: 0,
    summary: "",
    updated_at: "2026-10-28T12:00:00Z",
    messages: [
      {
        id: `greeting-${id}`,
        role: "AGENT",
        author: "Nexo Assist",
        content: `Contexto ${id}`,
        created_at: "2026-10-28T12:00:00Z",
        data: {},
      },
    ],
    drafts: [],
  };
}

test("resposta em andamento não contamina a conversa selecionada depois", async ({
  page,
}) => {
  const list = [conversation("A"), conversation("B")];
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/messages")) {
      started();
      await held;
      await route.fulfill({
        contentType: "text/event-stream",
        body: 'data: {"type":"delta","data":"Resposta exclusiva A"}\n\n',
      });
      return;
    }
    const result =
      path === "/api/me"
        ? user
        : path === "/api/runtime"
          ? { mode: "stub" }
          : path === "/api/conversations"
            ? list
            : list.find((item) => path.endsWith(`/${item.id}`));
    await route.fulfill({ json: result });
  });
  await page.goto("/");
  await expect(page.getByText("Contexto A", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill("Pergunta A");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await requested;
  await page.getByLabel("Retomar atendimento", { exact: true }).click();
  await page.locator(".history-options button").nth(1).click();
  await expect(page.getByText("Contexto B", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeEnabled();
  release();
  await expect(page.locator(".streaming")).toHaveCount(0);
  await expect(page.locator(".timeline")).not.toContainText(
    "Resposta exclusiva A",
  );
  await expect(page.getByText("Contexto B", { exact: true })).toBeVisible();
});

test("busca antiga não sobrescreve o filtro mais recente", async ({ page }) => {
  const old = conversation("antiga");
  const latest = conversation("nova");
  old.user = { ...user, name: "Antiga" };
  latest.user = { ...user, name: "Nova" };
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/me")
      return route.fulfill({ json: { ...user, role: "ANALYST" } });
    if (path === "/api/runtime")
      return route.fulfill({ json: { mode: "stub" } });
    if (path.endsWith("/tickets")) return route.fulfill({ json: [] });
    if (path === "/api/analyst/conversations") {
      if (url.searchParams.get("q") === "antiga") {
        started();
        await held;
        return route.fulfill({ json: [old] });
      }
      return route.fulfill({
        json: url.searchParams.get("q") ? [latest] : [old, latest],
      });
    }
    return route.fulfill({ json: path.endsWith("/nova") ? latest : old });
  });
  await page.goto("/");
  await expect(page.locator(".conversation-row")).toHaveCount(2);
  await page
    .getByRole("textbox", { name: "Pesquisar conversa ou chamado" })
    .fill("antiga");
  await requested;
  await page
    .getByRole("textbox", { name: "Pesquisar conversa ou chamado" })
    .fill("nova");
  await expect(page.locator(".conversation-row")).toHaveCount(1);
  await expect(page.locator(".conversation-row")).toContainText("Nova");
  release();
  await expect(page.locator(".workspace-header")).toContainText("Nova");
  await expect(page.locator(".conversation-row")).toContainText("Nova");
});

test("consultar cartão histórico no console não envia mensagem pelo analista", async ({
  page,
}) => {
  const context = conversation("historico");
  context.state = "HUMAN_ACTIVE";
  // A sessão abaixo representa o analista proprietário.
  Object.assign(context, { analyst_id: user.id });
  const ticket = {
    id: "INC-HISTORICO",
    code: "INC-HISTORICO",
    title: "Chamado do histórico",
    status: "OPEN",
    priority: "LOW",
    category: "Software",
    description: "Descrição",
    due_at: "2026-11-01T12:00:00Z",
    created_at: "2026-10-28T12:00:00Z",
    support_updated_at: "2026-10-28T12:00:00Z",
  };
  Object.assign(context.messages[0].data, {
    ticket_selection: true,
    tickets: [ticket],
  });
  let sends = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") {
      sends++;
      return route.fulfill({ json: {} });
    }
    const result =
      path === "/api/me"
        ? { ...user, role: "ANALYST" }
        : path === "/api/runtime"
          ? { mode: "stub" }
          : path.endsWith("/tickets")
            ? [ticket]
            : path === "/api/analyst/conversations" ||
                path.startsWith("/api/analyst/conversations?")
              ? [context]
              : path === "/api/conversations/historico"
                ? context
                : [context];
    await route.fulfill({ json: result });
  });
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeEnabled();
  await page.locator(".timeline .ticket-list-item").click();
  await expect(page.locator(".streaming")).toHaveCount(0);
  expect(sends).toBe(0);
});
