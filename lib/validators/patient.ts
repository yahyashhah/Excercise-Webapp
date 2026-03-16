import { z } from "zod";

export const patientProfileSchema = z.object({
  limitations: z.string().max(2000, "Limitations must be less than 2000 characters").optional().nullable(),
  comorbidities: z.string().max(2000, "Comorbidities must be less than 2000 characters").optional().nullable(),
  functionalChallenges: z
    .string()
    .max(2000, "Functional challenges must be less than 2000 characters")
    .optional()
    .nullable(),
  availableEquipment: z.array(z.string()).optional().nullable(),
  fitnessGoals: z.array(z.string()).optional().nullable(),
  preferredDurationMinutes: z.number().int().min(10).max(90).optional().nullable(),
  preferredDaysPerWeek: z.number().int().min(1).max(7).optional().nullable(),
});

export type PatientProfileInput = z.infer<typeof patientProfileSchema>;

export const linkPatientSchema = z.object({
  patientEmail: z.string().email("Please enter a valid patient email address"),
});

export type LinkPatientInput = z.infer<typeof linkPatientSchema>;
