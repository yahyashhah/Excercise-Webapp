import { z } from "zod";

export const workoutGenerationSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID"),
  limitations: z.string().max(2000).optional().nullable(),
  comorbidities: z.string().max(2000).optional().nullable(),
  functionalChallenges: z.string().max(2000).optional().nullable(),
  availableEquipment: z.array(z.string()).default([]),
  durationMinutes: z.number().int().min(10).max(90).default(25),
  daysPerWeek: z.number().int().min(1).max(7).default(3),
  fitnessGoals: z.array(z.string()).default([]),
});

export type WorkoutGenerationInput = z.infer<typeof workoutGenerationSchema>;

export const createPlanSchema = z.object({
  patientId: z.string().uuid("Invalid patient ID"),
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be less than 200 characters"),
  description: z.string().max(2000).optional().nullable(),
  durationMinutes: z.number().int().min(10).max(90).optional().nullable(),
  daysPerWeek: z.number().int().min(1).max(7).optional().nullable(),
  exercises: z.array(
    z.object({
      exerciseId: z.string().uuid("Invalid exercise ID"),
      dayOfWeek: z.number().int().min(1).max(7).optional().nullable(),
      orderIndex: z.number().int().min(0),
      sets: z.number().int().min(1).max(20),
      reps: z.number().int().min(1).max(100).optional().nullable(),
      durationSeconds: z.number().int().min(1).max(600).optional().nullable(),
      restSeconds: z.number().int().min(0).max(300).optional().nullable(),
      notes: z.string().max(500).optional().nullable(),
    })
  ).min(1, "At least one exercise is required").max(20, "Maximum 20 exercises per plan"),
  aiGenerationParams: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const updatePlanExerciseSchema = z.object({
  planExerciseId: z.string().uuid(),
  sets: z.number().int().min(1).max(20).optional(),
  reps: z.number().int().min(1).max(100).optional().nullable(),
  durationSeconds: z.number().int().min(1).max(600).optional().nullable(),
  restSeconds: z.number().int().min(0).max(300).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  orderIndex: z.number().int().min(0).optional(),
  dayOfWeek: z.number().int().min(1).max(7).optional().nullable(),
});

export type UpdatePlanExerciseInput = z.infer<typeof updatePlanExerciseSchema>;
