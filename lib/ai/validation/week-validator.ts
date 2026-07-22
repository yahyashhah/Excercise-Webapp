import type { GeneratedWeek, Regime } from "@/lib/ai/schemas/generated-week";

export const REGIME_BOUNDS: Record<Regime, { maxSets: number; minRestSeconds: number }> = {
  rehab: { maxSets: 4, minRestSeconds: 30 },
  hybrid: { maxSets: 5, minRestSeconds: 15 },
  performance: { maxSets: 6, minRestSeconds: 0 },
};

export interface WeekViolation {
  code:
    | "unknown_exercise"
    | "duplicate_across_weeks"
    | "dosage_out_of_bounds"
    | "missing_warmup"
    | "missing_cooldown"
    | "invalid_day";
  exerciseIndex?: number;
  dayOfWeek?: number;
  message: string;
}

export interface UnfilledSlot {
  weekIndex: number;
  dayOfWeek: number;
  phase: string;
  reason: string;
}

export interface WeekValidationContext {
  poolIds: Set<string>;
  usedIds: Set<string>;
  regime: Regime;
  allowedDays: number[];
  requireWarmupCooldown: boolean;
}

export function validateWeek(
  week: GeneratedWeek,
  ctx: WeekValidationContext
): WeekViolation[] {
  const violations: WeekViolation[] = [];
  const bounds = REGIME_BOUNDS[ctx.regime];
  const allowedDaySet = new Set(ctx.allowedDays);

  week.exercises.forEach((ex, exerciseIndex) => {
    if (!ctx.poolIds.has(ex.exerciseId)) {
      violations.push({
        code: "unknown_exercise",
        exerciseIndex,
        message: `"${ex.exerciseName}" (${ex.exerciseId}) is not in this week's exercise pool.`,
      });
    } else if (ctx.usedIds.has(ex.exerciseId)) {
      violations.push({
        code: "duplicate_across_weeks",
        exerciseIndex,
        message: `"${ex.exerciseName}" was already used in an earlier week.`,
      });
    }

    if (ex.sets > bounds.maxSets) {
      violations.push({
        code: "dosage_out_of_bounds",
        exerciseIndex,
        message: `${ex.sets} sets exceeds the ${ctx.regime} maximum of ${bounds.maxSets}.`,
      });
    }
    if (ex.restSeconds != null && ex.restSeconds < bounds.minRestSeconds) {
      violations.push({
        code: "dosage_out_of_bounds",
        exerciseIndex,
        message: `${ex.restSeconds}s rest is below the ${ctx.regime} minimum of ${bounds.minRestSeconds}s.`,
      });
    }

    if (!allowedDaySet.has(ex.dayOfWeek)) {
      violations.push({
        code: "invalid_day",
        exerciseIndex,
        message: `Exercise scheduled on weekday ${ex.dayOfWeek}, which is not an allowed training day.`,
      });
    }
  });

  week.sessions.forEach((session) => {
    if (!allowedDaySet.has(session.dayOfWeek)) {
      violations.push({
        code: "invalid_day",
        dayOfWeek: session.dayOfWeek,
        message: `Session "${session.name}" scheduled on weekday ${session.dayOfWeek}, which is not an allowed training day.`,
      });
    }
  });

  if (ctx.requireWarmupCooldown) {
    const days = new Set(week.exercises.map((e) => e.dayOfWeek));
    for (const day of days) {
      const dayExercises = week.exercises.filter((e) => e.dayOfWeek === day);
      if (!dayExercises.some((e) => e.phase === "WARMUP")) {
        violations.push({
          code: "missing_warmup",
          dayOfWeek: day,
          message: `Session on weekday ${day} has no warm-up exercise.`,
        });
      }
      if (!dayExercises.some((e) => e.phase === "COOLDOWN")) {
        violations.push({
          code: "missing_cooldown",
          dayOfWeek: day,
          message: `Session on weekday ${day} has no cool-down exercise.`,
        });
      }
    }
  }

  return violations;
}
