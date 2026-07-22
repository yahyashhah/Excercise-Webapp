import type { Regime } from "@/lib/ai/schemas/generated-week";
import type { RegimePromptContext } from "./shared-core";
import * as rehab from "./rehab";
import * as performance from "./performance";
import * as hybrid from "./hybrid";

export type { RegimePromptContext } from "./shared-core";
export type { Regime };

const REGIME_PROMPTS: Record<
  Regime,
  { version: string; buildSystemPrompt: (ctx: RegimePromptContext) => string }
> = {
  rehab: { version: rehab.PROMPT_VERSION, buildSystemPrompt: rehab.buildSystemPrompt },
  performance: {
    version: performance.PROMPT_VERSION,
    buildSystemPrompt: performance.buildSystemPrompt,
  },
  hybrid: { version: hybrid.PROMPT_VERSION, buildSystemPrompt: hybrid.buildSystemPrompt },
};

export function getRegimePrompt(regime: Regime) {
  return REGIME_PROMPTS[regime];
}

export interface RegimeSignals {
  primaryDiagnosis?: string | null;
  painScore?: number | null;
  injuryDate?: Date | string | null;
  surgeryHistory?: string | null;
  fitnessGoals?: string[] | null;
}

/**
 * Infer the programming regime from the client profile.
 * Clinical signals (diagnosis, pain, injury, surgery) → rehab.
 * Clinical signals + fitness goals → hybrid. Otherwise → performance.
 * The clinician can always override this in the generate form.
 */
export function inferRegime(signals: RegimeSignals): Regime {
  const hasClinical = Boolean(
    (signals.primaryDiagnosis && signals.primaryDiagnosis.trim()) ||
      (signals.painScore != null && signals.painScore > 0) ||
      signals.injuryDate ||
      (signals.surgeryHistory && signals.surgeryHistory.trim())
  );
  const hasGoals = Boolean(signals.fitnessGoals && signals.fitnessGoals.length > 0);

  if (hasClinical && hasGoals) return "hybrid";
  if (hasClinical) return "rehab";
  return "performance";
}
