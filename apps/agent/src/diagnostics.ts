export type FailureCode =
  | "MODEL_TIMEOUT"
  | "MODEL_RATE_LIMIT"
  | "MODEL_AUTH"
  | "MODEL_TRUNCATED"
  | "MODEL_INVALID_OUTPUT"
  | "MODEL_UNAVAILABLE";

// Only return fixed codes and numeric status. Never serialize provider errors:
// their message, body, URL and cause can contain prompts or credentials.
export function classifyFailure(error: unknown): {
  code: FailureCode;
  status: number | null;
  finish_reason?: string;
  tool_count?: number;
  validation?: { field: string; code: string }[];
} {
  const metadata: { finish_reason?: string; tool_count?: number } = {};
  if (error && typeof error === "object") {
    const top = error as Record<string, unknown>;
    if (
      typeof top.finish_reason === "string" &&
      [
        "stop",
        "length",
        "tool-calls",
        "error",
        "unknown",
        "other",
        "content-filter",
      ].includes(top.finish_reason)
    )
      metadata.finish_reason = top.finish_reason;
    if (
      typeof top.tool_count === "number" &&
      top.tool_count >= 0 &&
      top.tool_count <= 12
    )
      metadata.tool_count = top.tool_count;
  }
  const seen = new Set<unknown>();
  let current = error;
  let status: number | null = null;
  for (let depth = 0; depth < 6; depth++) {
    if (!current || typeof current !== "object" || seen.has(current)) break;
    seen.add(current);
    const item = current as Record<string, unknown>;
    if (
      typeof item.statusCode === "number" &&
      item.statusCode >= 400 &&
      item.statusCode <= 599
    )
      status = item.statusCode;
    if (
      item.name === "TimeoutError" ||
      item.name === "AbortError" ||
      item.name === "MastraTimeoutError"
    )
      return { ...metadata, code: "MODEL_TIMEOUT", status };
    if (item.id === "STRUCTURED_OUTPUT_TRUNCATED")
      return { ...metadata, code: "MODEL_TRUNCATED", status };
    if (
      item.name === "ZodError" ||
      item.name === "NoObjectGeneratedError" ||
      item.name === "AI_NoObjectGeneratedError"
    ) {
      const allowedFields = new Set([
        "intent",
        "reply",
        "confidence",
        "rationale",
        "facts",
        "article_ids",
        "facts.os",
        "facts.category",
        "facts.title",
        "facts.description",
        "facts.kind",
        "facts.affected_scope",
        "facts.blocked",
        "facts.same_day",
        "facts.workaround",
      ]);
      const validation = Array.isArray(item.issues)
        ? item.issues.slice(0, 8).flatMap((issue) => {
            if (!issue || typeof issue !== "object") return [];
            const field = Array.isArray(issue.path) ? issue.path.join(".") : "";
            const code = [
              "invalid_type",
              "invalid_value",
              "too_big",
              "too_small",
              "unrecognized_keys",
            ].includes(issue.code)
              ? issue.code
              : "invalid";
            return [
              { field: allowedFields.has(field) ? field : "$output", code },
            ];
          })
        : [];
      return {
        ...metadata,
        code: "MODEL_INVALID_OUTPUT",
        status,
        ...(validation.length ? { validation } : {}),
      };
    }
    current = item.cause;
  }
  if (status === 429) return { ...metadata, code: "MODEL_RATE_LIMIT", status };
  if (status === 401 || status === 403)
    return { ...metadata, code: "MODEL_AUTH", status };
  return { ...metadata, code: "MODEL_UNAVAILABLE", status };
}
