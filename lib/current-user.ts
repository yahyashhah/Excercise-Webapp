import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";

export async function getCurrentUser(): Promise<User> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user) redirect("/onboarding");
  if (!user.onboarded) redirect("/onboarding");

  return user;
}

export async function getCurrentUserOrNull(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { clerkId: userId } });
}

export async function requireRole(role: "CLINICIAN" | "PATIENT"): Promise<User> {
  const user = await getCurrentUser();
  if (user.role !== role) redirect("/dashboard");
  return user;
}
