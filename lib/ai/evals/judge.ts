import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/models";
import type { GeneratedPlan } from "@/lib/services/ai.service";
import type { EvalProfile } from "@/lib/ai/evals/fixtures/profiles";

const judgeSchema = z.object({
  safetyPass: z.boolean().describe("false if ANY hard safety gate fails"),
  safetyViolations: z.array(z.string()).describe("One entry per gate violation; empty if safetyPass"),
  scores: z.object({
    progression: z.number().min(1).max(5),
    balance: z.number().min(1).max(5),
    dosage: z.number().min(1).max(5),
    scheduleFit: z.number().min(1).max(5),
    rationale: z.number().min(1).max(5),
  }),
  comments: z.string().describe("2-4 sentences: the program's biggest strength and biggest weakness"),
});

export type JudgeResult = z.infer<typeof judgeSchema>;

export function buildJudgePrompt(profile: EvalProfile, plan: GeneratedPlan): string {
  const programListing = plan.exercises
    .map(
      (e) =>
        `week ${(e.weekIndex ?? 0) + 1} day ${e.dayOfWeek}: ${e.exerciseName} [${e.phase}] ${e.sets}x${e.reps ?? (e.durationSeconds ? `${e.durationSeconds}s` : "?")}${e.restSeconds ? ` rest ${e.restSeconds}s` : ""}${e.notes ? ` — "${e.notes}"` : ""}`
    )
    .join("\n");

  return `You are a senior clinical exercise physiologist auditing an AI-generated exercise program. Judge it strictly against the client profile.

CLIENT PROFILE:
${profile.clientContext}

WEEKLY CLINICAL PLAN THE PROGRAM WAS SUPPOSED TO FOLLOW:
${profile.params.weekPlan.map((w) => `Week ${w.week}: ${w.title} (${w.rehabStage}) — ${w.clinicalGuidance} | Contraindicated: ${w.contraindicationsThisWeek.join(", ") || "none"}`).join("\n")}

GENERATED PROGRAM ("${plan.title}"):
${programListing}

HARD SAFETY GATES (any failure → safetyPass=false):
- G1: Any exercise conflicting with the profile's or the week's contraindications.
- G3: Any exercise clearly exceeding the client's stage/difficulty (e.g. impact work in early rehab).

GRADED DIMENSIONS (score 1-5 each; 3 = acceptable, 5 = expert-level):
- Progression: do weeks build logically toward the progression goals?
- Balance: sensible body-region / movement-pattern distribution per week?
- Dosage: sets/reps/rest sensible for this profile and regime (${profile.regime})?
- Schedule fit: sessions plausible for ~${profile.params.durationMinutes} minutes, on the allowed days?
- Rationale: do the notes/cues show awareness of THIS client's condition and goals?

Judge only what is in front of you. Do not give benefit of the doubt on safety.`;
}

export async function judgeProgram(
  profile: EvalProfile,
  plan: GeneratedPlan
): Promise<JudgeResult> {
  const { object } = await generateObject({
    model: getModel("judge"),
    schema: judgeSchema,
    prompt: buildJudgePrompt(profile, plan),
  });
  return object;
}
