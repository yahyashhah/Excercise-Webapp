import { streamObject } from "ai";
import { getModel } from "@/lib/ai/models";
import { toAIGenerationError, type AIErrorKind } from "@/lib/ai/errors";
import {
  generatedWeekSchema,
  type GeneratedWeek,
  type Regime,
} from "@/lib/ai/schemas/generated-week";
import { validateWeek, type UnfilledSlot } from "@/lib/ai/validation/week-validator";
import { repairWeek } from "@/lib/ai/validation/repair";
import { getRegimePrompt, inferRegime } from "@/lib/ai/prompts/regimes";
import {
  buildClientContext,
  buildExercisePoolForWeek,
  type ExercisePoolItem,
  type GeneratedPlan,
  type GenerateWorkoutParams,
} from "@/lib/services/ai.service";

export type GenerationEvent =
  | { type: "start"; totalWeeks: number; allowedDays: number[] }
  | { type: "week_start"; weekIndex: number; weekTitle: string }
  | { type: "week_partial"; weekIndex: number; partial: unknown }
  | {
      type: "week_status";
      weekIndex: number;
      status: "validating" | "repairing" | "ready";
      unfilled: UnfilledSlot[];
    }
  | { type: "done"; plan: GeneratedPlan; unfilled: UnfilledSlot[] }
  | { type: "error"; kind: AIErrorKind; message: string; retryable: boolean };

export interface GenerationOptions {
  signal?: AbortSignal;
  /** Evals inject a synthetic client profile without touching the DB. */
  clientContextOverride?: string;
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
};

function resolveAllowedDays(params: GenerateWorkoutParams): number[] {
  const preferred = (params.preferredWeekdays ?? [])
    .map((d) => WEEKDAY_TO_INDEX[d.toLowerCase().trim()])
    .filter((d): d is number => Number.isInteger(d));
  const days =
    preferred.length > 0
      ? preferred
      : Array.from({ length: Math.max(1, Math.min(params.daysPerWeek, 7)) }, (_, i) => i);
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

function formatPoolSummary(pool: ExercisePoolItem[]): string {
  return pool
    .map(
      (e) =>
        `ID: ${e.id} | ${e.name} | Phase: ${e.exercisePhases.length ? e.exercisePhases.join("/") : "STRENGTHENING"} | Region: ${e.bodyRegion} | Difficulty: ${e.difficultyLevel} | Muscles: ${e.musclesTargeted.join(", ")} | Equipment: ${e.equipmentRequired.join(", ") || "None"} | Default Rx: ${e.defaultSets ?? 3}x${e.defaultReps ? e.defaultReps : e.defaultHoldSeconds ? e.defaultHoldSeconds + "s hold" : "10"}`
    )
    .join("\n");
}

/**
 * Sequential week-by-week generation with validation and one repair round.
 * Weeks are generated in order so each week's prompt genuinely knows what
 * earlier weeks used (replaces the old parallel-pools/dedup-by-prompt approach).
 * Never throws mid-stream — failures surface as a terminal "error" event.
 */
export async function* generateProgramEvents(
  params: GenerateWorkoutParams & { regime?: Regime },
  opts: GenerationOptions = {}
): AsyncGenerator<GenerationEvent> {
  try {
    const weekPlans = params.weekPlan ?? [];
    if (weekPlans.length === 0) {
      throw new Error("generateProgramEvents requires params.weekPlan (the clinical plan).");
    }

    const { context: fetchedContext, limitations, regimeSignals } =
      await buildClientContext(params.clientId);
    const clientContext = opts.clientContextOverride ?? fetchedContext;
    const regime: Regime = params.regime ?? inferRegime(regimeSignals);

    const allowedDays = resolveAllowedDays(params);
    const circuits = params.circuits ?? [];
    const hasCircuits = circuits.length > 0;
    const totalExercisesPerSession = hasCircuits
      ? circuits.reduce((sum, c) => sum + c.exerciseCount, 0)
      : (params.exercisesPerSession ?? 6);
    const circuitStructure = hasCircuits
      ? circuits
          .map((c, i) => `  Circuit ${i} "${c.name}" (${c.focusType}): EXACTLY ${c.exerciseCount} exercises per session/day`)
          .join("\n")
      : null;
    // When the trainer defined an explicit circuit structure, that structure is
    // their choice — only demand warmup/cooldown phases for non-circuit programs.
    const requireWarmupCooldown = !hasCircuits;

    yield { type: "start", totalWeeks: weekPlans.length, allowedDays };

    const usedIds = new Set<string>();
    const allUnfilled: UnfilledSlot[] = [];
    const allSessions: GeneratedPlan["sessions"] = [];
    const allExercises: GeneratedPlan["exercises"] = [];
    let programTitle = "";
    let programDescription = "";

    const { buildSystemPrompt } = getRegimePrompt(regime);

    for (let weekIndex = 0; weekIndex < weekPlans.length; weekIndex++) {
      opts.signal?.throwIfAborted();
      const wPlan = weekPlans[weekIndex];
      yield { type: "week_start", weekIndex, weekTitle: wPlan.title };

      // Sequential pool build: usedIds now genuinely excludes earlier weeks at query time.
      const pool = await buildExercisePoolForWeek(wPlan, usedIds, limitations, params.availableEquipment);
      const poolSummary = formatPoolSummary(pool);
      const poolIds = new Set(pool.map((e) => e.id));

      const system = buildSystemPrompt({
        totalExercisesPerSession,
        allowedDayIndices: allowedDays,
        circuitStructure,
        weekNumber: wPlan.week,
        totalWeeks: weekPlans.length,
      });

      const prompt = `${clientContext}

Week ${wPlan.week} of ${weekPlans.length}: ${wPlan.title} (${wPlan.rehabStage})
Clinical Guidance: ${wPlan.clinicalGuidance}
Progression Goal: ${wPlan.progressionGoal}
Contraindicated This Week: ${wPlan.contraindicationsThisWeek.join(", ") || "None"}

Program: ${params.daysPerWeek} sessions this week, ~${params.durationMinutes} min/session
Total exercises in output: EXACTLY ${params.daysPerWeek * totalExercisesPerSession} (${totalExercisesPerSession} per session × ${params.daysPerWeek} days)
${weekIndex === 0 ? "Include a program title and 2-3 sentence description." : "Set title and description to null (already set in week 1)."}
${params.subjective ? `Trainer Subjective: ${params.subjective}` : ""}
${params.trainerPrompt ? `Trainer Instructions: ${params.trainerPrompt}` : ""}

Available Exercises (use ONLY these IDs):
${poolSummary || "No tagged exercises found — use general bodyweight exercises appropriate for this stage."}`;

      const result = streamObject({
        model: getModel("generation"),
        schema: generatedWeekSchema,
        system,
        prompt,
        abortSignal: opts.signal,
      });

      // If partialObjectStream iteration throws before we await result.object,
      // that promise would reject unhandled. This no-op guard (a separate
      // promise) silences the unhandled-rejection flag; the original
      // result.object we await below still surfaces the real error.
      result.object.catch(() => {});

      for await (const partial of result.partialObjectStream) {
        yield { type: "week_partial", weekIndex, partial };
      }

      const week: GeneratedWeek = await result.object;

      yield { type: "week_status", weekIndex, status: "validating", unfilled: [] };
      const ctx = { poolIds, usedIds, regime, allowedDays, requireWarmupCooldown };
      const violations = validateWeek(week, ctx);

      let finalWeek = week;
      let weekUnfilled: UnfilledSlot[] = [];
      if (violations.length > 0) {
        yield { type: "week_status", weekIndex, status: "repairing", unfilled: [] };
        const repaired = await repairWeek(week, violations, { ...ctx, weekIndex, poolSummary });
        finalWeek = repaired.week;
        weekUnfilled = repaired.unfilled;
        allUnfilled.push(...weekUnfilled);
      }

      if (weekIndex === 0) {
        programTitle = finalWeek.title ?? "";
        programDescription = finalWeek.description ?? "";
      }
      for (const s of finalWeek.sessions) {
        allSessions.push({ dayOfWeek: s.dayOfWeek, weekIndex, name: s.name });
      }
      for (const ex of finalWeek.exercises) {
        usedIds.add(ex.exerciseId);
        allExercises.push({
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          phase: ex.phase,
          circuitIndex: ex.circuitIndex ?? undefined,
          sets: ex.sets,
          reps: ex.reps ?? undefined,
          durationSeconds: ex.durationSeconds ?? undefined,
          restSeconds: ex.restSeconds ?? undefined,
          weekIndex,
          dayOfWeek: ex.dayOfWeek,
          orderIndex: ex.orderIndex,
          notes: ex.notes ?? undefined,
        });
      }

      yield { type: "week_status", weekIndex, status: "ready", unfilled: weekUnfilled };
    }

    if (allExercises.length === 0) {
      yield {
        type: "error",
        kind: "validation_exhausted",
        message: "The AI produced no valid exercises for this program. Please try again.",
        retryable: true,
      };
      return;
    }

    yield {
      type: "done",
      plan: {
        title: programTitle || "AI Generated Program",
        description: programDescription,
        sessions: allSessions,
        exercises: allExercises,
      },
      unfilled: allUnfilled,
    };
  } catch (error) {
    const aiError = toAIGenerationError(error);
    yield {
      type: "error",
      kind: aiError.kind,
      message: aiError.message,
      retryable: aiError.retryable,
    };
  }
}
