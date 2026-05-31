"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function invitePatientAction(patientEmail: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };
  if (!dbUser.clerkOrgId) return { success: false as const, error: "Clinic not set up" };

  const trimmedEmail = patientEmail.trim().toLowerCase();
  if (!trimmedEmail) return { success: false as const, error: "Email is required" };

  try {
    const client = await clerkClient();
    await client.organizations.createOrganizationInvitation({
      organizationId: dbUser.clerkOrgId,
      inviterUserId: userId,
      emailAddress: trimmedEmail,
      role: "org:member",
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/patient`,
    });

    revalidatePath("/patients");
    return { success: true as const };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send invitation";
    console.error("Failed to invite patient:", err);
    return { success: false as const, error: message };
  }
}
