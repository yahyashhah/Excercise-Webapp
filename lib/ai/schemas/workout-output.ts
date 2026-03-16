import { z } from "zod";

export const generatedExerciseSchema = z.object({
  exerciseId: z.string().uuid(),
  exerciseName: z.string(),
  sets: z.number().int().min(1).max(10),
  reps: z.number().int().min(1).max(100).optional().nullable(),
  durationSeconds: z.number().int().min(5).max(300).optional().nullable(),
  restSeconds: z.number().int().min(0).max(180).default(60),
  rationale: z.string(),
  orderIndex: z.number().int().min(0),
  dayOfWeek: z.number().int().min(1).max(7).optional().nullable(),
});

export type GeneratedExercise = z.infer<typeof generatedExerciseSchema>;

export const generatedWorkoutSchema = z.object({
  title: z.string(),
  description: z.string(),
  exercises: z.array(generatedExerciseSchema).min(1),
  overallRationale: z.string(),
  durationMinutes: z.number(),
  daysPerWeek: z.number(),
});

export type GeneratedWorkout = z.infer<typeof generatedWorkoutSchema>;
