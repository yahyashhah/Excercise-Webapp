import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/models";
import type { GeneratedWeek } from "@/lib/ai/schemas/generated-week";
import {
  validateWeek,
  type UnfilledSlot,
  type WeekViolation,
  type WeekValidationContext,
} from "@/lib/ai/validation/week-validator";

export interface RepairContext extends WeekValidationContext {
  weekIndex: number;
  /** Preformatted "ID: … | name | …" listing of this week's pool. */
  poolSummary: string;
}

const repairSchema = z.object({
  replacements: z.array(
    z.object({
      exerciseIndex: z.number().int().min(0).describe("The exerciseIndex being replaced, copied from the problem list."),
      exerciseId: z.string().describe("A valid ID from the pool."),
      exerciseName: z.string(),
      sets: z.number().int().min(1).max(10),
      reps: z.number().int().min(1).max(100).nullable(),
      durationSeconds: z.number().int().min(5).max(600).nullable(),
      restSeconds: z.number().int().min(0).max(600).nullable(),
    })
  ),
});

const REPAIRABLE_CODES = new Set<WeekViolation["code"]>([
  "unknown_exercise",
  "duplicate_across_weeks",
  "dosage_out_of_bounds",
  "invalid_day",
]);

export function buildRepairPrompt(
  week: GeneratedWeek,
  violations: WeekViolation[],
  poolSummary: string
): string {
  const problems = violations
    .filter((v) => v.exerciseIndex != null)
    .map((v) => {
      const ex = week.exercises[v.exerciseIndex!];
      return `- exerciseIndex ${v.exerciseIndex}: "${ex.exerciseName}" (phase ${ex.phase}, day ${ex.dayOfWeek}) — problem: ${v.message}`;
    })
    .join("\n");

  return `Some exercises in a generated workout week were invalid. For EACH problem below, pick a replacement exercise from the pool that fits the same slot (same phase, same day) and fix the stated problem. Keep sets/reps/rest sensible for the slot. Use ONLY IDs from the pool.

PROBLEMS:
${problems}

EXERCISE POOL:
${poolSummary}

Return one replacement per problem, keyed by the exerciseIndex given above.`;
}

/**
 * One targeted repair round. Repairable violations get a single AI re-ask
 * scoped to the invalid items; anything still invalid afterwards is removed
 * and reported as an UnfilledSlot. Never throws — a failed repair call
 * degrades to unfilled slots so generation can continue.
 */
export async function repairWeek(
  week: GeneratedWeek,
  violations: WeekViolation[],
  ctx: RepairContext
): Promise<{ week: GeneratedWeek; unfilled: UnfilledSlot[] }> {
  const unfilled: UnfilledSlot[] = [];

  // Structural session-level gaps are not AI-repairable — surface them directly.
  for (const v of violations) {
    if (v.code === "missing_warmup" || v.code === "missing_cooldown") {
      unfilled.push({
        weekIndex: ctx.weekIndex,
        dayOfWeek: v.dayOfWeek ?? 0,
        phase: v.code === "missing_warmup" ? "WARMUP" : "COOLDOWN",
        reason: v.message,
      });
    }
  }

  const repairable = violations.filter(
    (v) => REPAIRABLE_CODES.has(v.code) && v.exerciseIndex != null
  );
  if (repairable.length === 0) {
    return { week, unfilled };
  }

  const invalidIndexes = new Set(repairable.map((v) => v.exerciseIndex!));
  let repaired: GeneratedWeek = week;

  try {
    const { object } = await generateObject({
      model: getModel("generation"),
      schema: repairSchema,
      prompt: buildRepairPrompt(week, repairable, ctx.poolSummary),
    });

    const byIndex = new Map(object.replacements.map((r) => [r.exerciseIndex, r]));
    repaired = {
      ...week,
      exercises: week.exercises.map((ex, i) => {
        const replacement = byIndex.get(i);
        if (!replacement || !invalidIndexes.has(i)) return ex;
        return {
          ...ex,
          exerciseId: replacement.exerciseId,
          exerciseName: replacement.exerciseName,
          sets: replacement.sets,
          reps: replacement.reps,
          durationSeconds: replacement.durationSeconds,
          restSeconds: replacement.restSeconds,
        };
      }),
    };
  } catch (error) {
    console.error(`[AI repair] week ${ctx.weekIndex + 1} repair call failed:`, error);
    // fall through — the still-invalid originals are removed below
  }

  // Re-validate; drop anything still invalid and record it honestly.
  const remaining = validateWeek(repaired, ctx).filter(
    (v) => REPAIRABLE_CODES.has(v.code) && v.exerciseIndex != null
  );
  const dropIndexes = new Set(remaining.map((v) => v.exerciseIndex!));

  for (const v of remaining) {
    const ex = repaired.exercises[v.exerciseIndex!];
    unfilled.push({
      weekIndex: ctx.weekIndex,
      dayOfWeek: ex.dayOfWeek,
      phase: ex.phase,
      reason: v.message,
    });
  }

  return {
    week: {
      ...repaired,
      exercises: repaired.exercises.filter((_, i) => !dropIndexes.has(i)),
    },
    unfilled,
  };
}
