"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { submitFeedbackSchema, respondToFeedbackSchema } from "@/lib/validators/feedback";
import * as feedbackService from "@/lib/services/feedback.service";
import type { FeedbackRating } from "@prisma/client";

export async function submitFeedbackAction(input: {
  planExerciseId: string;
  rating: string;
  comment?: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "PATIENT") return { success: false as const, error: "Forbidden" };

  const parsed = submitFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const feedback = await feedbackService.submitFeedback({
      planExerciseId: parsed.data.planExerciseId,
      patientId: dbUser.id,
      rating: parsed.data.rating as FeedbackRating,
      comment: parsed.data.comment,
    });

    revalidatePath("/workout-plans");
    return { success: true as const, data: feedback };
  } catch (error) {
    console.error("Failed to submit feedback:", error);
    return { success: false as const, error: "Failed to submit feedback" };
  }
}

export async function respondToFeedbackAction(input: {
  feedbackId: string;
  clinicianResponse: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };

  const parsed = respondToFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    await feedbackService.respondToFeedback(parsed.data.feedbackId, parsed.data.clinicianResponse);
    revalidatePath("/dashboard");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to respond to feedback:", error);
    return { success: false as const, error: "Failed to respond" };
  }
}
