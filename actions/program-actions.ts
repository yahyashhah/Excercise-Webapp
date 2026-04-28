"use server";

import { generateProgram } from "@/lib/services/ai.service";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import * as programService from "@/lib/services/program.service";
import {
  createProgramSchema,
  updateProgramSchema,
  assignProgramSchema,
} from "@/lib/validators/program";
import { scheduleProgramForPatientAction } from "@/actions/calendar-actions";
import type {
  CreateProgramInput,
  UpdateProgramInput,
} from "@/lib/validators/program";

async function getClinicianUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser || dbUser.role !== "CLINICIAN") return null;
  return dbUser;
}

export async function createProgramAction(input: CreateProgramInput) {
  const user = await getClinicianUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const parsed = createProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const program = await programService.createProgram(user.id, parsed.data);
    revalidatePath("/programs");
    return { success: true as const, data: program };
  } catch (error) {
    console.error("Failed to create program:", error);
    return { success: false as const, error: "Failed to create program" };
  }
}

export async function updateProgramAction(
  programId: string,
  input: UpdateProgramInput
) {
  const user = await getClinicianUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { clinicianId: true },
  });
  if (!program || program.clinicianId !== user.id) {
    return { success: false as const, error: "Forbidden" };
  }

  const parsed = updateProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const updated = await programService.updateProgram(programId, parsed.data);
    revalidatePath("/programs");
    revalidatePath(`/programs/${programId}`);
    return { success: true as const, data: updated };
  } catch (error) {
    console.error("Failed to update program:", error);
    return { success: false as const, error: "Failed to update program" };
  }
}

export async function deleteProgramAction(programId: string) {
  const user = await getClinicianUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { clinicianId: true },
  });
  if (!program || program.clinicianId !== user.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    await programService.deleteProgram(programId);
    revalidatePath("/programs");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete program:", error);
    return { success: false as const, error: "Failed to delete program" };
  }
}

export async function duplicateProgramAction(
  programId: string,
  asTemplate = false
) {
  const user = await getClinicianUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  try {
    const program = await programService.duplicateProgram(
      programId,
      user.id,
      asTemplate
    );
    revalidatePath("/programs");
    return { success: true as const, data: program };
  } catch (error) {
    console.error("Failed to duplicate program:", error);
    return { success: false as const, error: "Failed to duplicate program" };
  }
}

export async function assignProgramAction(input: {
  programId: string;
  patientId: string;
  startDate: string;
}) {
  const user = await getClinicianUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  const parsed = assignProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const program = await prisma.program.findUnique({
    where: { id: parsed.data.programId },
    select: { clinicianId: true },
  });
  if (!program || program.clinicianId !== user.id) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    const result = await programService.assignProgram(
      parsed.data.programId,
      parsed.data.patientId,
      new Date(parsed.data.startDate)
    );
    revalidatePath("/programs");
    revalidatePath(`/programs/${parsed.data.programId}`);
    revalidatePath(`/patients/${parsed.data.patientId}`);
    revalidatePath("/dashboard");
    return { success: true as const, data: result };
  } catch (error) {
    console.error("Failed to assign program:", error);
    return { success: false as const, error: "Failed to assign program" };
  }
}

export async function getProgramsAction(filters?: {
  search?: string;
  status?: string;
  isTemplate?: boolean;
}) {
  const user = await getClinicianUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  try {
    const programs = await programService.getPrograms(user.id, filters
      ? { ...filters, status: filters.status as import("@prisma/client").PlanStatus | undefined }
      : undefined);
    return { success: true as const, data: programs };
  } catch (error) {
    console.error("Failed to fetch programs:", error);
    return { success: false as const, error: "Failed to fetch programs" };
  }
}

export async function getProgramAction(programId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  try {
    const program = await programService.getProgramById(programId);
    if (!program)
      return { success: false as const, error: "Program not found" };

    if (program.clinicianId !== dbUser.id && program.patientId !== dbUser.id) {
      return { success: false as const, error: "Forbidden" };
    }

    return { success: true as const, data: program };
  } catch (error) {
    console.error("Failed to fetch program:", error);
    return { success: false as const, error: "Failed to fetch program" };
  }
}


export async function generateProgramAction(params: any) {
  const user = await getClinicianUser();
  if (!user) return { success: false as const, error: "Unauthorized" };

  try {
    const aiPlan = await generateProgram(params);

    const program = await prisma.program.create({
      data: {
        name: aiPlan.name,
        description: aiPlan.description || "Generated by AI",
        isTemplate: true,
        clinicianId: user.id,
        aiGenerationParams: params,
        workouts: {
          create: aiPlan.workouts.map((w: any) => ({
            name: w.name,
            dayIndex: w.dayIndex,
            orderIndex: w.dayIndex,
            blocks: {
              create: w.blocks.map((b: any) => ({
                type: b.type || "NORMAL",
                name: b.name || b.type || "NORMAL",
                orderIndex: b.orderIndex,
                exercises: {
                  create: b.exercises.map((e: any, idx: number) => ({
                    exerciseId: e.exerciseId,
                    orderIndex: e.orderIndex,
                    sets: {
                      create: Array.from({ length: e.sets || 1 }).map((_, i) => ({
                        orderIndex: i,
                        targetReps: parseInt(e.reps?.toString() || "10", 10)
                      }))
                    }
                  }))
                }
              }))
            }
          }))
        }
      }
    });

    if (params.patientId) {
      const scheduleResult = await scheduleProgramForPatientAction({
        programId: program.id,
        patientId: params.patientId,
        startDate: params.startDate ?? new Date().toISOString().split("T")[0],
        preferredWeekdays: params.preferredWeekdays || ["Monday", "Wednesday", "Friday"],
      });
      
      revalidatePath("/programs");
      revalidatePath(`/patients/${params.patientId}`);
      
      if (scheduleResult.success && scheduleResult.programId) {
        return { success: true as const, data: scheduleResult.programId };
      }
    }

    revalidatePath("/programs");
    return { success: true as const, data: program.id };
  } catch (error) {
    console.error("Failed to generate program:", error);
    return { success: false as const, error: "Failed to generate program" };
  }
}
