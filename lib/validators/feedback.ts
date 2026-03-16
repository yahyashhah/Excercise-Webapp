import { z } from "zod";

export const submitFeedbackSchema = z.object({
  planExerciseId: z.string().min(1, "Exercise is required"),
  rating: z.enum(["FELT_GOOD", "MILD_DISCOMFORT", "PAINFUL", "UNSURE_HOW_TO_PERFORM"]),
  comment: z.string().max(1000).optional(),
});

export const respondToFeedbackSchema = z.object({
  feedbackId: z.string().min(1),
  clinicianResponse: z.string().min(1, "Response is required").max(2000),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
export type RespondToFeedbackInput = z.infer<typeof respondToFeedbackSchema>;
