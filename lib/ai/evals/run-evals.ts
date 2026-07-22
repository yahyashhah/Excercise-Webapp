/**
 * Eval runner — generates a program per fixture profile and scores it.
 * Costs real tokens and needs DATABASE_URL + provider API keys. Run manually:
 *   npm run eval                    # all profiles, current models
 *   npm run eval -- post-op-acl    # only profiles whose id includes the arg
 * Compare models by re-running with AI_MODEL_GENERATION overridden.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EVAL_PROFILES } from "@/lib/ai/evals/fixtures/profiles";
import { judgeProgram, type JudgeResult } from "@/lib/ai/evals/judge";
import { getModelId } from "@/lib/ai/models";
import { generateProgramEvents } from "@/lib/services/program-generation.service";
import type { GeneratedPlan } from "@/lib/services/ai.service";

interface EvalRow {
  id: string;
  regime: string;
  gatesPass: boolean;
  safetyViolations: string[];
  scores: JudgeResult["scores"] | null;
  mean: number | null;
  unfilledSlots: number;
  error: string | null;
  comments: string;
}

async function generateForProfile(profileId: string): Promise<{ plan: GeneratedPlan | null; unfilled: number; error: string | null }> {
  const profile = EVAL_PROFILES.find((p) => p.id === profileId)!;
  let plan: GeneratedPlan | null = null;
  let unfilled = 0;
  let error: string | null = null;

  for await (const event of generateProgramEvents(
    {
      clientId: null,
      regime: profile.regime,
      durationMinutes: profile.params.durationMinutes,
      daysPerWeek: profile.params.daysPerWeek,
      preferredWeekdays: profile.params.preferredWeekdays,
      difficultyLevel: profile.params.difficultyLevel,
      exercisesPerSession: profile.params.exercisesPerSession,
      weekPlan: profile.params.weekPlan,
    },
    { clientContextOverride: profile.clientContext }
  )) {
    if (event.type === "done") {
      plan = event.plan;
      unfilled = event.unfilled.length;
    }
    if (event.type === "error") error = `${event.kind}: ${event.message}`;
  }
  return { plan, unfilled, error };
}

async function main() {
  const filter = process.argv[2];
  const profiles = filter
    ? EVAL_PROFILES.filter((p) => p.id.includes(filter))
    : EVAL_PROFILES;

  const generationModel = getModelId("generation");
  const judgeModel = getModelId("judge");
  console.log(`Evaluating ${profiles.length} profiles | generation=${generationModel} | judge=${judgeModel}\n`);

  const rows: EvalRow[] = [];
  for (const profile of profiles) {
    process.stdout.write(`- ${profile.id} … `);
    const { plan, unfilled, error } = await generateForProfile(profile.id);
    if (!plan) {
      rows.push({ id: profile.id, regime: profile.regime, gatesPass: false, safetyViolations: [], scores: null, mean: null, unfilledSlots: unfilled, error: error ?? "no plan produced", comments: "" });
      console.log(`GENERATION FAILED (${error})`);
      continue;
    }
    const judged = await judgeProgram(profile, plan);
    const scoreValues = Object.values(judged.scores);
    const mean = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
    rows.push({
      id: profile.id,
      regime: profile.regime,
      gatesPass: judged.safetyPass,
      safetyViolations: judged.safetyViolations,
      scores: judged.scores,
      mean: Number(mean.toFixed(2)),
      unfilledSlots: unfilled,
      error: null,
      comments: judged.comments,
    });
    console.log(`${judged.safetyPass ? "gates OK" : "GATES FAILED"} | mean ${mean.toFixed(2)} | unfilled ${unfilled}`);
  }

  const passed = rows.filter((r) => r.gatesPass && (r.mean ?? 0) >= 3.5).length;
  const suiteMean =
    rows.filter((r) => r.mean != null).reduce((a, r) => a + (r.mean ?? 0), 0) /
    Math.max(1, rows.filter((r) => r.mean != null).length);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportDir = join(process.cwd(), "lib/ai/evals/reports");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, `${stamp}--${generationModel.replace(":", "_")}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify({ generationModel, judgeModel, suiteMean: Number(suiteMean.toFixed(2)), passed, total: rows.length, rows }, null, 2)
  );

  console.log(`\nSuite: ${passed}/${rows.length} passed | mean ${suiteMean.toFixed(2)}`);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
