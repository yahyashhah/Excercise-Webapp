import { z } from "zod";

export const onboardingSchema = z.object({
  role: z.enum(["CLINICIAN", "PATIENT"]),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  phone: z.string().max(20).optional(),
  dateOfBirth: z.string().optional(),
  limitations: z.string().max(2000).optional(),
  comorbidities: z.string().max(2000).optional(),
  functionalChallenges: z.string().max(2000).optional(),
  availableEquipment: z.array(z.string()).default([]),
  fitnessGoals: z.array(z.string()).default([]),
  preferredDurationMinutes: z.number().int().min(5).max(120).default(25),
  preferredDaysPerWeek: z.number().int().min(1).max(7).default(3),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
