"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { clinicProfileSchema } from "@/lib/validators/clinic";
import * as clinicService from "@/lib/services/clinic.service";

export async function saveClinicProfileAction(input: {
  clinicName: string;
  tagline?: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };
  if (dbUser.role !== "CLINICIAN")
    return { success: false as const, error: "Forbidden" };

  const parsed = clinicProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const profile = await clinicService.upsertClinicProfile(dbUser.id, {
      clinicName: parsed.data.clinicName,
      tagline: parsed.data.tagline || null,
      logoUrl: parsed.data.logoUrl || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      website: parsed.data.website || null,
      address: parsed.data.address || null,
    });

    revalidatePath("/settings/clinic");
    return { success: true as const, data: profile };
  } catch (error) {
    console.error("Failed to save clinic profile:", error);
    return { success: false as const, error: "Failed to save clinic profile" };
  }
}
