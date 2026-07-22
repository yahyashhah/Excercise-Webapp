import { APICallError } from "ai";

export type AIErrorKind =
  | "rate_limit"
  | "timeout"
  | "provider_down"
  | "validation_exhausted"
  | "aborted"
  | "config"
  | "unknown";

const RETRYABLE: Record<AIErrorKind, boolean> = {
  rate_limit: true,
  timeout: true,
  provider_down: true,
  unknown: true,
  validation_exhausted: false,
  aborted: false,
  config: false,
};

export class AIGenerationError extends Error {
  readonly kind: AIErrorKind;
  readonly retryable: boolean;

  constructor(kind: AIErrorKind, message: string, retryableOverride?: boolean) {
    super(message);
    this.name = "AIGenerationError";
    this.kind = kind;
    this.retryable = retryableOverride ?? RETRYABLE[kind];
  }
}

/** Map any thrown value (AI SDK errors, aborts, plain Errors) to a typed AIGenerationError. */
export function toAIGenerationError(error: unknown): AIGenerationError {
  if (error instanceof AIGenerationError) return error;

  if (error instanceof Error && error.name === "AbortError") {
    return new AIGenerationError("aborted", "Generation was cancelled.");
  }

  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 0;
    if (status === 429) {
      return new AIGenerationError(
        "rate_limit",
        "The AI provider is rate-limiting requests. Please try again in a minute."
      );
    }
    if (status >= 500) {
      return new AIGenerationError(
        "provider_down",
        "The AI provider is having temporary issues. Please try again shortly."
      );
    }
    return new AIGenerationError("unknown", error.message);
  }

  const message = error instanceof Error ? error.message : String(error);
  return new AIGenerationError("unknown", message);
}
