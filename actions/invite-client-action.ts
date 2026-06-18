"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function inviteClientAction(clientEmail: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "TRAINER") return { success: false as const, error: "Forbidden" };
  if (!dbUser.clerkOrgId) return { success: false as const, error: "Organization not set up" };

  const trimmedEmail = clientEmail.trim().toLowerCase();
  if (!trimmedEmail) return { success: false as const, error: "Email is required" };

  try {
    const client = await clerkClient();
    await client.organizations.createOrganizationInvitation({
      organizationId: dbUser.clerkOrgId,
      inviterUserId: userId,
      emailAddress: trimmedEmail,
      role: "org:member",
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/client`,
    });

    revalidatePath("/clients");
    return { success: true as const };
  } catch (err: unknown) {
    // Clerk errors have an `errors` array with the real messages
    if (err && typeof err === "object" && "errors" in err) {
      const clerkErrors = (err as { errors: Array<{ message: string; longMessage?: string }> }).errors;
      const detail = clerkErrors.map((e) => e.longMessage ?? e.message).join("; ");
      console.error("Clerk invitation error:", detail, clerkErrors);
      return { success: false as const, error: detail || "Failed to send invitation" };
    }
    const message = err instanceof Error ? err.message : "Failed to send invitation";
    console.error("Failed to invite client:", err);
    return { success: false as const, error: message };
  }
}
