import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const origin = request.headers.get("origin");
  // In Docker Next binds 0.0.0.0; the browser-facing host is the Host header.
  const expectedOrigin = process.env.APP_ORIGIN
    ? new URL(process.env.APP_ORIGIN).origin
    : `${new URL(request.url).protocol}//${request.headers.get("host")}`;
  if (
    !["GET", "HEAD"].includes(request.method) &&
    origin &&
    origin !== expectedOrigin
  ) {
    return Response.json({ detail: "Origem não autorizada." }, { status: 403 });
  }
  const headers = new Headers();
  for (const name of ["cookie", "content-type", "origin"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const response = await fetch(
      `${process.env.API_URL ?? "http://127.0.0.1:8000"}/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`,
      {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method)
          ? undefined
          : await request.text(),
        cache: "no-store",
        signal: request.signal,
      },
    );
    const outgoing = new Headers({
      "Content-Type":
        response.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    });
    for (const cookie of response.headers.getSetCookie())
      outgoing.append("Set-Cookie", cookie);
    if (response.headers.get("x-accel-buffering") === "no")
      outgoing.set("X-Accel-Buffering", "no");
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return Response.json(
      {
        detail: "O serviço está temporariamente indisponível. Tente novamente.",
      },
      { status: 502 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH };
