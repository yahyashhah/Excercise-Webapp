/** Safety rules shared by every regime. Never weaken these. */
export const SAFETY_CORE = `CRITICAL SAFETY RULES (non-negotiable, apply to every program):
1. Use ONLY exercise IDs from the provided pool. NEVER invent IDs.
2. NEVER select an exercise that conflicts with the client's documented contraindications or this week's specific contraindications.
3. Respect equipment availability — only select exercises whose required equipment the client has. Bodyweight is always available.
4. Never exceed the client's stated difficulty level.
5. Write 1-2 specific technique cues per exercise in "notes", relevant to this client and this week's goals.
6. Session names must reflect the session's actual focus — never generic labels like "Workout 1".`;

export interface RegimePromptContext {
  totalExercisesPerSession: number;
  allowedDayIndices: number[];
  circuitStructure: string | null;
  weekNumber: number;
  totalWeeks: number;
}

/** Structural requirements shared by every regime, parameterized per request. */
export function buildStructureRules(ctx: RegimePromptContext): string {
  const lines = [
    `STRUCTURE:`,
    `- Every training day must have EXACTLY ${ctx.totalExercisesPerSession} exercises.`,
    `- Distribute sessions using ONLY these weekday indexes: ${ctx.allowedDayIndices.join(", ")}.`,
  ];
  if (ctx.circuitStructure) {
    lines.push(
      `- Each exercise MUST include circuitIndex (0-based). Circuit structure per session:`,
      ctx.circuitStructure
    );
  }
  return lines.join("\n");
}
