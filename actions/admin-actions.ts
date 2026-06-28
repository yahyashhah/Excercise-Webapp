"use server";

import type { Prisma } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function archiveUserAction(userId: string) {
  try {
    await requireSuperAdmin();
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: String(e) };
  }
}

export async function restoreUserAction(userId: string) {
  try {
    await requireSuperAdmin();
    await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: String(e) };
  }
}

export async function deleteUserAction(userId: string) {
  try {
    await requireSuperAdmin();
    await prisma.user.delete({ where: { id: userId } });
    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (e) {
    const isPrismaRelationError =
      e instanceof Error &&
      "code" in e &&
      (e as Prisma.PrismaClientKnownRequestError).code?.startsWith("P2");
    const msg = isPrismaRelationError
      ? "Cannot delete: this user has existing data. Archive them instead."
      : "Failed to delete user.";
    return { success: false as const, error: msg };
  }
}
