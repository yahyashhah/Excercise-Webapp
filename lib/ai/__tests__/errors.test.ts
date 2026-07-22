import { describe, it, expect } from "vitest";
import { APICallError } from "ai";
import { AIGenerationError, toAIGenerationError } from "@/lib/ai/errors";

function makeApiCallError(statusCode: number) {
  return new APICallError({
    message: `HTTP ${statusCode}`,
    url: "https://example.com",
    requestBodyValues: {},
    statusCode,
    responseHeaders: {},
    responseBody: "",
  });
}

describe("AIGenerationError", () => {
  it("marks rate_limit, timeout, provider_down and unknown as retryable", () => {
    expect(new AIGenerationError("rate_limit", "x").retryable).toBe(true);
    expect(new AIGenerationError("timeout", "x").retryable).toBe(true);
    expect(new AIGenerationError("provider_down", "x").retryable).toBe(true);
    expect(new AIGenerationError("unknown", "x").retryable).toBe(true);
  });

  it("marks validation_exhausted, aborted and config as not retryable", () => {
    expect(new AIGenerationError("validation_exhausted", "x").retryable).toBe(false);
    expect(new AIGenerationError("aborted", "x").retryable).toBe(false);
    expect(new AIGenerationError("config", "x").retryable).toBe(false);
  });

  it("lets an explicit retryableOverride win over the RETRYABLE table", () => {
    // validation_exhausted defaults to non-retryable, but the pipeline can flag
    // a particular exhaustion as retryable (e.g. transient empty output).
    expect(new AIGenerationError("validation_exhausted", "x", true).retryable).toBe(true);
    // …and the reverse: force a normally-retryable kind to be terminal.
    expect(new AIGenerationError("rate_limit", "x", false).retryable).toBe(false);
  });
});

describe("toAIGenerationError", () => {
  it("passes through an existing AIGenerationError", () => {
    const err = new AIGenerationError("config", "bad");
    expect(toAIGenerationError(err)).toBe(err);
  });

  it("maps HTTP 429 to rate_limit", () => {
    expect(toAIGenerationError(makeApiCallError(429)).kind).toBe("rate_limit");
  });

  it("maps HTTP 500+ to provider_down", () => {
    expect(toAIGenerationError(makeApiCallError(503)).kind).toBe("provider_down");
  });

  it("maps AbortError to aborted", () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    expect(toAIGenerationError(abort).kind).toBe("aborted");
  });

  it("maps anything else to unknown, preserving the message", () => {
    const mapped = toAIGenerationError(new Error("boom"));
    expect(mapped.kind).toBe("unknown");
    expect(mapped.message).toBe("boom");
  });
});
