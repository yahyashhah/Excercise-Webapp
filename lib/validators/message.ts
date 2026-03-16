import { z } from "zod";

export const sendMessageSchema = z.object({
  recipientId: z.string().min(1, "Recipient is required"),
  content: z.string().min(1, "Message cannot be empty").max(5000),
  planId: z.string().optional(),
  planExerciseId: z.string().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
