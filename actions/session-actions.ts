"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import * as sessionService from "@/lib/services/session.service";

export async function rescheduleSessionAction(
  sessionId: string,
  newDate: string
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  try {
    const session = await sessionService.rescheduleSession(
      sessionId,
      new Date(newDate)
    );
    revalidatePath("/dashboard");
    revalidatePath("/programs");
    return { success: true as const, data: session };
  } catch (error) {
    console.error("Failed to reschedule session:", error);
    return { success: false as const, error: "Failed to reschedule session" };
  }
}

export async function getClinicianSessionsAction(
  from: string,
  to: string,
  patientId?: string
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "CLINICIAN")
    return { success: false as const, error: "Unauthorized" };

  try {
    const sessions = await sessionService.getSessionsForClinician(dbUser.id, {
      from: new Date(from),
      to: new Date(to),
      patientId,
    });
    return { success: true as const, data: sessions };
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return { success: false as const, error: "Failed to fetch sessions" };
  }
}

export async function getPatientSessionsAction(from?: string, to?: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  try {
    const sessions = await sessionService.getSessionsForPatient(dbUser.id, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return { success: true as const, data: sessions };
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return { success: false as const, error: "Failed to fetch sessions" };
  }
}
