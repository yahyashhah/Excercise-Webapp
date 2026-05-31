"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export interface ClinicMetadata {
  clinicName: string;
  tagline?: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}

export async function getOrganizationProfile(): Promise<ClinicMetadata | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser?.clerkOrgId) return null;

  const client = await clerkClient();
  const org = await client.organizations.getOrganization({ organizationId: dbUser.clerkOrgId });

  const meta = (org.publicMetadata ?? {}) as Record<string, string>;
  return {
    clinicName: org.name,
    tagline: meta.tagline ?? "",
    logoUrl: meta.logoUrl ?? "",
    phone: meta.phone ?? "",
    email: meta.email ?? "",
    website: meta.website ?? "",
    address: meta.address ?? "",
  };
}

export async function saveOrganizationProfile(input: ClinicMetadata) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN") return { success: false as const, error: "Forbidden" };
  if (!dbUser.clerkOrgId) return { success: false as const, error: "Clinic not set up" };

  if (!input.clinicName?.trim()) {
    return { success: false as const, error: "Clinic name is required" };
  }

  try {
    const client = await clerkClient();
    await client.organizations.updateOrganization(dbUser.clerkOrgId, {
      name: input.clinicName.trim(),
      publicMetadata: {
        tagline: input.tagline ?? "",
        logoUrl: input.logoUrl ?? "",
        phone: input.phone ?? "",
        email: input.email ?? "",
        website: input.website ?? "",
        address: input.address ?? "",
      },
    });

    revalidatePath("/settings/clinic");
    return { success: true as const };
  } catch (err) {
    console.error("Failed to save clinic profile:", err);
    return { success: false as const, error: "Failed to save clinic profile" };
  }
}
