import assert from "node:assert/strict";
import test from "node:test";
import { classifyFailure } from "./diagnostics.ts";

test("classifies timeouts and provider failures without exposing their content", () => {
  assert.equal(
    classifyFailure({ cause: { name: "TimeoutError" } }).code,
    "MODEL_TIMEOUT",
  );
  assert.equal(
    classifyFailure({ cause: { statusCode: 429 } }).code,
    "MODEL_RATE_LIMIT",
  );
  assert.equal(classifyFailure({ statusCode: 401 }).code, "MODEL_AUTH");
  assert.equal(
    classifyFailure({ name: "MastraTimeoutError" }).code,
    "MODEL_TIMEOUT",
  );
  const sensitive = {
    message: "private-prompt-api-key",
    responseBody: "private-body",
    url: "private-url",
  };
  assert.deepEqual(classifyFailure(sensitive), {
    code: "MODEL_UNAVAILABLE",
    status: null,
  });
  assert.ok(!JSON.stringify(classifyFailure(sensitive)).includes("private"));
});

test("distinguishes invalid output from truncation and tolerates circular causes", () => {
  assert.equal(
    classifyFailure({ id: "STRUCTURED_OUTPUT_TRUNCATED" }).code,
    "MODEL_TRUNCATED",
  );
  assert.equal(
    classifyFailure({ name: "ZodError" }).code,
    "MODEL_INVALID_OUTPUT",
  );
  const circular: { cause?: unknown } = {};
  circular.cause = circular;
  assert.equal(classifyFailure(circular).code, "MODEL_UNAVAILABLE");
});

test("validation diagnostics expose only known fields and fixed issue codes", () => {
  const result = classifyFailure({
    finish_reason: "tool-calls",
    tool_count: 4,
    cause: {
      name: "ZodError",
      issues: [
        { path: [], code: "invalid_type", message: "private-output" },
        { path: ["facts", "kind"], code: "invalid_value" },
        { path: ["private-field"], code: "private-code" },
      ],
    },
  });
  assert.equal(result.finish_reason, "tool-calls");
  assert.equal(result.tool_count, 4);
  assert.deepEqual(result.validation, [
    { field: "$output", code: "invalid_type" },
    { field: "facts.kind", code: "invalid_value" },
    { field: "$output", code: "invalid" },
  ]);
  assert.ok(!JSON.stringify(result).includes("private"));
});
