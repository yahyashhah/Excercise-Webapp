import { describe, it, expect, afterEach, vi } from "vitest";
import { getModelId, getModel, getOpenAIModelName } from "@/lib/ai/models";
import { AIGenerationError } from "@/lib/ai/errors";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getModelId", () => {
  it("returns the default for each role when no env override is set", () => {
    expect(getModelId("generation")).toBe("openai:gpt-4o");
    expect(getModelId("extraction")).toBe("openai:gpt-4o");
    expect(getModelId("insights")).toBe("openai:gpt-4o-mini");
    expect(getModelId("utility")).toBe("openai:gpt-4o-mini");
    expect(getModelId("judge")).toBe("openai:gpt-4o");
  });

  it("honors the env override for a role", () => {
    vi.stubEnv("AI_MODEL_GENERATION", "anthropic:claude-sonnet-5");
    expect(getModelId("generation")).toBe("anthropic:claude-sonnet-5");
  });
});

describe("getModel", () => {
  it("resolves an anthropic model with the bare model name", () => {
    vi.stubEnv("AI_MODEL_INSIGHTS", "anthropic:claude-haiku-4-5");
    const model = getModel("insights");
    expect(typeof model).toBe("object");
    expect((model as { modelId: string }).modelId).toBe("claude-haiku-4-5");
  });

  it("resolves an openai model with the bare model name", () => {
    const model = getModel("generation");
    expect(typeof model).toBe("object");
    expect((model as { modelId: string }).modelId).toBe("gpt-4o");
  });

  it("throws AIGenerationError(config) for an unknown provider", () => {
    vi.stubEnv("AI_MODEL_UTILITY", "gemini:gemini-pro");
    expect(() => getModel("utility")).toThrowError(AIGenerationError);
  });

  it("throws AIGenerationError(config) when the id has no provider prefix", () => {
    vi.stubEnv("AI_MODEL_UTILITY", "gpt-4o");
    expect(() => getModel("utility")).toThrowError(AIGenerationError);
  });
});

describe("getOpenAIModelName", () => {
  it("returns the bare model name for an openai-configured role", () => {
    expect(getOpenAIModelName("extraction")).toBe("gpt-4o");
  });

  it("throws AIGenerationError(config) when the role is configured with a non-openai provider", () => {
    vi.stubEnv("AI_MODEL_EXTRACTION", "anthropic:claude-sonnet-5");
    expect(() => getOpenAIModelName("extraction")).toThrowError(AIGenerationError);
  });
});
