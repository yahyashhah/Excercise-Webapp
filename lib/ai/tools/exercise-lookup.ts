import { z } from "zod";

export const selectExerciseSchema = z.object({
  exercise_id: z.string().describe("The UUID of the exercise to include in the workout plan"),
  sets: z.number().int().min(1).max(10).describe("Number of sets for this exercise"),
  reps: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Number of repetitions per set (use for strength exercises)"),
  duration_seconds: z
    .number()
    .int()
    .min(5)
    .max(300)
    .optional()
    .describe("Duration in seconds per set (use for timed exercises like stretches or holds)"),
  rest_seconds: z
    .number()
    .int()
    .min(0)
    .max(180)
    .default(60)
    .describe("Rest period in seconds between sets"),
  rationale: z.string().describe("Brief clinical rationale for selecting this exercise"),
  order_index: z
    .number()
    .int()
    .min(0)
    .describe("Position in the workout (0-based, lower numbers first)"),
  day_of_week: z
    .number()
    .int()
    .min(1)
    .max(7)
    .optional()
    .describe("Day of week (1=Monday, 7=Sunday) if applicable"),
});

export type SelectExerciseInput = z.infer<typeof selectExerciseSchema>;

export const selectExerciseTool = {
  name: "select_exercise",
  description:
    "Select an exercise from the available exercise library to include in the patient's workout plan. Call this tool once for each exercise you want to add.",
  input_schema: {
    type: "object" as const,
    properties: {
      exercise_id: {
        type: "string",
        description: "The UUID of the exercise to include in the workout plan",
      },
      sets: {
        type: "number",
        description: "Number of sets for this exercise (1-10)",
      },
      reps: {
        type: "number",
        description:
          "Number of repetitions per set (use for strength exercises, 1-100)",
      },
      duration_seconds: {
        type: "number",
        description:
          "Duration in seconds per set (use for timed exercises like stretches or holds, 5-300)",
      },
      rest_seconds: {
        type: "number",
        description: "Rest period in seconds between sets (0-180, default 60)",
      },
      rationale: {
        type: "string",
        description: "Brief clinical rationale for selecting this exercise",
      },
      order_index: {
        type: "number",
        description: "Position in the workout (0-based, lower numbers first)",
      },
      day_of_week: {
        type: "number",
        description: "Day of week (1=Monday, 7=Sunday) if applicable",
      },
    },
    required: ["exercise_id", "sets", "rationale", "order_index"],
  },
};
