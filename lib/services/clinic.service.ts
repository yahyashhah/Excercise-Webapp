import { prisma } from "@/lib/prisma";

export async function getClinicProfile(clinicianId: string) {
  return prisma.clinicProfile.findUnique({
    where: { clinicianId },
  });
}

export async function upsertClinicProfile(
  clinicianId: string,
  data: {
    clinicName: string;
    tagline?: string | null;
    logoUrl?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    address?: string | null;
  }
) {
  return prisma.clinicProfile.upsert({
    where: { clinicianId },
    update: {
      clinicName: data.clinicName,
      tagline: data.tagline ?? null,
      logoUrl: data.logoUrl ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      website: data.website ?? null,
      address: data.address ?? null,
    },
    create: {
      clinicianId,
      clinicName: data.clinicName,
      tagline: data.tagline ?? null,
      logoUrl: data.logoUrl ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      website: data.website ?? null,
      address: data.address ?? null,
    },
  });
}
