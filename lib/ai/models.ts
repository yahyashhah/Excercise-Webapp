import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { AIGenerationError } from "./errors";

export type AIRole = "generation" | "extraction" | "insights" | "utility" | "judge";

/**
 * The ONLY place model IDs live. Format: "provider:model".
 * `generation` default is benchmarked against anthropic:claude-sonnet-5 in the
 * eval suite (Task 12) — change the default here once the benchmark picks a winner.
 * insights/utility/judge default to OpenAI because this environment only has an
 * OPENAI_API_KEY configured — override via env if an ANTHROPIC_API_KEY is added.
 */
const DEFAULT_MODELS: Record<AIRole, string> = {
  generation: "openai:gpt-4o",
  extraction: "openai:gpt-4o",
  insights: "openai:gpt-4o-mini",
  utility: "openai:gpt-4o-mini",
  judge: "openai:gpt-4o",
};

const ENV_OVERRIDES: Record<AIRole, string> = {
  generation: "AI_MODEL_GENERATION",
  extraction: "AI_MODEL_EXTRACTION",
  insights: "AI_MODEL_INSIGHTS",
  utility: "AI_MODEL_UTILITY",
  judge: "AI_MODEL_JUDGE",
};

/** Resolve the "provider:model" id for a role. Env override wins over the default. */
export function getModelId(role: AIRole): string {
  return process.env[ENV_OVERRIDES[role]] || DEFAULT_MODELS[role];
}

function splitModelId(role: AIRole): { provider: string; modelName: string } {
  const id = getModelId(role);
  const sep = id.indexOf(":");
  if (sep === -1) {
    throw new AIGenerationError(
      "config",
      `Invalid model id "${id}" for role "${role}" — expected "provider:model".`
    );
  }
  return { provider: id.slice(0, sep), modelName: id.slice(sep + 1) };
}

/** Resolve an AI SDK LanguageModel for a role. */
export function getModel(role: AIRole): LanguageModel {
  const { provider, modelName } = splitModelId(role);
  if (provider === "anthropic") return anthropic(modelName);
  if (provider === "openai") return openai(modelName);
  throw new AIGenerationError(
    "config",
    `Unknown AI provider "${provider}" for role "${role}". Supported: anthropic, openai.`
  );
}

/**
 * For flows still on the raw OpenAI client (brief extraction, which needs
 * OpenAI strict json_schema + finish_reason handling). Throws if the role
 * is configured with a non-OpenAI provider.
 */
export function getOpenAIModelName(role: AIRole): string {
  const { provider, modelName } = splitModelId(role);
  if (provider !== "openai") {
    throw new AIGenerationError(
      "config",
      `Role "${role}" is configured with "${getModelId(role)}" but this flow requires an OpenAI model.`
    );
  }
  return modelName;
}
