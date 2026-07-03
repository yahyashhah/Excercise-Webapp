"use server";

import { requireSuperAdmin } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { updateProgramSchema, assignProgramSchema } from "@/lib/validators/program";
import type { UpdateProgramInput } from "@/lib/validators/program";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function updateAdminProgramAction(
  programId: string,
  input: UpdateProgramInput
) {
  await requireSuperAdmin();

  const existing = await prisma.program.findUnique({
    where: { id: programId },
    select: { isGlobal: true },
  });
  if (!existing) {
    return { success: false as const, error: "Program not found" };
  }
  if (existing.isGlobal) {
    return {
      success: false as const,
      error: "Use the Global Programs section to edit this program",
    };
  }

  const parsed = updateProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const updated = await programService.updateProgram(programId, parsed.data);
    revalidatePath("/admin/programs");
    revalidatePath(`/admin/programs/${programId}`);
    return { success: true as const, data: updated };
  } catch (error) {
    console.error("Failed to update program (admin):", error);
    return { success: false as const, error: "Failed to update program" };
  }
}

export async function assignAdminProgramAction(input: {
  programId: string;
  clientId: string;
  startDate: string;
}) {
  await requireSuperAdmin();

  const parsed = assignProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const existing = await prisma.program.findUnique({
    where: { id: parsed.data.programId },
    select: { isGlobal: true },
  });
  if (!existing) {
    return { success: false as const, error: "Program not found" };
  }
  if (existing.isGlobal) {
    return {
      success: false as const,
      error: "Use the Global Programs section to edit this program",
    };
  }

  try {
    const result = await programService.assignProgram(
      parsed.data.programId,
      parsed.data.clientId,
      new Date(parsed.data.startDate)
    );
    revalidatePath("/admin/programs");
    revalidatePath(`/admin/programs/${parsed.data.programId}`);
    revalidatePath(`/clients/${parsed.data.clientId}`);
    revalidatePath("/dashboard");
    return { success: true as const, data: result };
  } catch (error) {
    console.error("Failed to assign program (admin):", error);
    return { success: false as const, error: "Failed to assign program" };
  }
}
