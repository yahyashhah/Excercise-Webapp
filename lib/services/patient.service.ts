import { prisma } from "@/lib/prisma";

export async function getPatientsForClinician(clinicianId: string) {
  const clinician = await prisma.user.findUnique({
    where: { id: clinicianId },
    select: { clerkOrgId: true },
  });
  if (!clinician?.clerkOrgId) return [];

  return prisma.user.findMany({
    where: { clerkOrgId: clinician.clerkOrgId, role: "PATIENT" },
    include: { patientProfile: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPatientIdsForClinician(clinicianId: string): Promise<string[]> {
  const clinician = await prisma.user.findUnique({
    where: { id: clinicianId },
    select: { clerkOrgId: true },
  });
  if (!clinician?.clerkOrgId) return [];

  const patients = await prisma.user.findMany({
    where: { clerkOrgId: clinician.clerkOrgId, role: "PATIENT" },
    select: { id: true },
  });
  return patients.map((p) => p.id);
}

export async function getPatientDetail(patientId: string) {
  return prisma.user.findUnique({
    where: { id: patientId },
    include: {
      patientProfile: true,
      plansAsPatient: {
        include: { _count: { select: { exercises: true, sessions: true } } },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
}

export async function getCliniciansForPatient(patientId: string) {
  const patient = await prisma.user.findUnique({
    where: { id: patientId },
    select: { clerkOrgId: true },
  });
  if (!patient?.clerkOrgId) return [];

  const clinician = await prisma.user.findFirst({
    where: { clerkOrgId: patient.clerkOrgId, role: "CLINICIAN" },
  });
  return clinician ? [clinician] : [];
}
