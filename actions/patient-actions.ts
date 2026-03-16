"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import * as patientService from "@/lib/services/patient.service";

export async function linkPatientAction(patientEmail: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };

  const patient = await prisma.user.findUnique({
    where: { email: patientEmail },
  });

  if (!patient) return { success: false as const, error: "Patient not found. They must sign up first." };
  if (patient.role !== "PATIENT") return { success: false as const, error: "User is not a patient" };

  try {
    await patientService.linkPatientToClinician(patient.id, dbUser.id);
    revalidatePath("/patients");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to link patient:", error);
    return { success: false as const, error: "Failed to link patient" };
  }
}

export async function unlinkPatientAction(patientId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };

  try {
    await patientService.unlinkPatient(patientId, dbUser.id);
    revalidatePath("/patients");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to unlink patient:", error);
    return { success: false as const, error: "Failed to unlink patient" };
  }
}

export async function searchPatientsAction(email: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };

  try {
    const patients = await patientService.searchPatientsByEmail(email, dbUser.id);
    return { success: true as const, data: patients };
  } catch (error) {
    console.error("Failed to search patients:", error);
    return { success: false as const, error: "Failed to search patients" };
  }
}
