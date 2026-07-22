import { generateObject } from "ai";
import { getModel } from "@/lib/ai/models";
import { toAIGenerationError } from "@/lib/ai/errors";
import { z } from "zod";
import {
  getClientSnapshots,
  computeCompletionRate,
  computeSessionStreak,
  getLastActivityAt,
} from "@/lib/services/dashboard-insights.service";

const insightSchema = z.object({
  insights: z
    .array(
      z.object({
        clientName: z.string().describe("The exact client name from the provided data"),
        insight: z.string().describe("One short, specific, actionable coaching sentence"),
        type: z.enum(["warning", "suggestion", "positive"]),
      })
    )
    .max(4),
});

export type CoachingInsight = z.infer<typeof insightSchema>["insights"][number];

const MAX_CLIENTS_IN_CONTEXT = 12;
const DAY_MS = 1000 * 60 * 60 * 24;

export async function generateCoachingInsights(
  trainerId: string,
  now: Date = new Date()
): Promise<CoachingInsight[]> {
  const snapshots = await getClientSnapshots(trainerId, now);
  const active = snapshots.filter((s) => s.activeProgram || s.sessions.length > 0);
  if (active.length === 0) return [];

  const context = active
    .slice(0, MAX_CLIENTS_IN_CONTEXT)
    .map((s) => {
      const { rate, scheduled } = computeCompletionRate(s.sessions, now);
      const streak = computeSessionStreak(s.sessions, now);
      const lastActivity = getLastActivityAt(s.sessions);
      const daysSince = lastActivity
        ? Math.floor((now.getTime() - lastActivity.getTime()) / DAY_MS)
        : null;
      const feedback = s.recentFeedback.map((f) => f.rating).join(", ") || "none";
      const completion = scheduled > 0 ? `${Math.round(rate * 100)}%` : "n/a";
      return `- ${s.clientName}: program "${s.activeProgram?.name ?? "none"}", completion ${completion} over last 14d (${scheduled} scheduled), current streak ${streak}, days since last activity ${daysSince ?? "never"}, recent feedback: ${feedback}`;
    })
    .join("\n");

  try {
    const { object } = await generateObject({
      model: getModel("insights"),
      schema: insightSchema,
      prompt: `You are an assistant coach for a physical-therapy and senior-fitness trainer. Based on the per-client data below, write 2-4 short, specific, actionable coaching insights.

Rules:
- Each insight must reference a real client by their exact name and be a single sentence.
- Prioritise the most notable clients: pain or discomfort, low adherence, standout consistency, or a plateau worth progressing.
- Use type "warning" for concerns (pain, inactivity, dropping adherence), "suggestion" for programming ideas (progress load, swap an exercise), and "positive" for clients doing well.
- Do not invent data that is not present below.

Client data:
${context}`,
    });

    return object.insights.slice(0, 4);
  } catch (error) {
    throw toAIGenerationError(error);
  }
}
