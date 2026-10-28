import { createServer } from "node:http";

createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/health") {
    res.end(JSON.stringify({status: "ok", mode: process.env.LLM_MODE ?? "stub"}));
    return;
  }
  res.writeHead(404).end(JSON.stringify({error: "not_found"}));
}).listen(4111, "0.0.0.0");
