import { z } from "zod";

export const sendMessageSchema = z.object({
  recipientId: z.string().min(1, "Recipient is required"),
  content: z.string().min(1, "Message cannot be empty").max(5000),
  planId: z.string().optional(),
  planExerciseId: z.string().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const sendBroadcastMessageSchema = z
  .object({
    content: z.string().min(1, "Message cannot be empty").max(5000),
    recipientIds: z.array(z.string().min(1)).optional(),
    sendToAll: z.boolean().optional(),
  })
  .refine((data) => data.sendToAll === true || (data.recipientIds?.length ?? 0) > 0, {
    message: "Select at least one recipient",
    path: ["recipientIds"],
  });

export type SendBroadcastMessageInput = z.infer<typeof sendBroadcastMessageSchema>;
