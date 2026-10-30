import { createServer } from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { decide, inputSchema } from "./decision.ts";
import { classifyFailure } from "./diagnostics.ts";

createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/health") {
    res.end(
      JSON.stringify({ status: "ok", mode: process.env.LLM_MODE ?? "stub" }),
    );
    return;
  }
  if (req.method !== "POST" || req.url !== "/decide") {
    res.writeHead(404).end(JSON.stringify({ error: "not_found" }));
    return;
  }
  const secret = process.env.INTERNAL_AGENT_SECRET ?? "";
  const supplied = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  const digest = (s: string) => createHash("sha256").update(s).digest();
  if (
    secret.length < 32 ||
    !timingSafeEqual(digest(supplied), digest(secret))
  ) {
    res.writeHead(401).end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  let body = "";
  const suppliedId = req.headers["x-request-id"];
  const requestId =
    typeof suppliedId === "string" && /^[0-9a-f-]{36}$/i.test(suppliedId)
      ? suppliedId
      : randomUUID();
  const started = performance.now();
  res.setHeader("X-Request-ID", requestId);
  try {
    for await (const chunk of req) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 120000) {
        res.writeHead(413).end();
        return;
      }
    }
    const parsed = inputSchema.safeParse(JSON.parse(body));
    if (!parsed.success) {
      res.writeHead(422).end(JSON.stringify({ error: "invalid_contract" }));
      return;
    }
    res.end(JSON.stringify(await decide(parsed.data)));
  } catch (error) {
    const failure = classifyFailure(error);
    console.error(
      JSON.stringify({
        event: "agent_failure",
        request_id: requestId,
        code: failure.code,
        provider_status: failure.status,
        finish_reason: failure.finish_reason,
        tool_count: failure.tool_count,
        validation: failure.validation,
        duration_ms: Math.round(performance.now() - started),
      }),
    );
    res.writeHead(503).end(
      JSON.stringify({
        error: "agent_unavailable",
        code: failure.code,
        request_id: requestId,
        retryable: true,
      }),
    );
  }
}).listen(4111, "0.0.0.0");
