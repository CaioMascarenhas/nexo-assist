import { expect, test } from "@playwright/test";

test("proxy permite login na própria origem e rejeita outra origem", async ({
  request,
  baseURL,
}) => {
  const data = { email: "ana.souza@nexo.com.br", password: "demo" };
  const rejected = await request.post("/api/auth/login", {
    headers: { origin: "https://origem-externa.example" },
    data,
  });
  expect(rejected.status()).toBe(403);
  const accepted = await request.post("/api/auth/login", {
    headers: { origin: new URL(baseURL!).origin },
    data,
  });
  expect(accepted.ok()).toBeTruthy();
  expect((await request.get("/api/me")).ok()).toBeTruthy();
});
