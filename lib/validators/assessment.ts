import { z } from "zod";

export const createAssessmentSchema = z.object({
  patientId: z.string().min(1, "Patient is required"),
  assessmentType: z.string().min(1, "Assessment type is required"),
  value: z.number().min(0, "Value must be positive"),
  unit: z.string().min(1, "Unit is required"),
  notes: z.string().max(2000).optional(),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
