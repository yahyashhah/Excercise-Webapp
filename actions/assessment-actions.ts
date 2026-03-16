"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createAssessmentSchema } from "@/lib/validators/assessment";
import * as outcomeService from "@/lib/services/outcome.service";

export async function createAssessmentAction(input: {
  patientId?: string;
  assessmentType: string;
  value: number;
  unit: string;
  notes?: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  // Patients always record for themselves; clinicians must supply a patientId
  if (dbUser.role === "CLINICIAN" && !input.patientId) {
    return { success: false as const, error: "Please select a patient" };
  }
  const resolvedPatientId =
    dbUser.role === "PATIENT" ? dbUser.id : (input.patientId ?? "");

  const parsed = createAssessmentSchema.safeParse({
    ...input,
    patientId: resolvedPatientId,
  });
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const assessment = await outcomeService.recordAssessment({
      patientId: parsed.data.patientId,
      assessedById: dbUser.role === "CLINICIAN" ? dbUser.id : undefined,
      assessmentType: parsed.data.assessmentType,
      value: parsed.data.value,
      unit: parsed.data.unit,
      notes: parsed.data.notes,
    });

    revalidatePath("/assessments");
    return { success: true as const, data: assessment };
  } catch (error) {
    console.error("Failed to create assessment:", error);
    return { success: false as const, error: "Failed to record assessment" };
  }
}
