import { prisma } from "@/lib/prisma";

export async function getPatientsForClinician(clinicianId: string) {
  const links = await prisma.patientClinicianLink.findMany({
    where: { clinicianId, status: "active" },
    include: {
      patient: {
        include: { patientProfile: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return links.map((l) => l.patient);
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

export async function linkPatientToClinician(patientId: string, clinicianId: string) {
  return prisma.patientClinicianLink.upsert({
    where: {
      patientId_clinicianId: { patientId, clinicianId },
    },
    update: { status: "active" },
    create: { patientId, clinicianId },
  });
}

export async function unlinkPatient(patientId: string, clinicianId: string) {
  return prisma.patientClinicianLink.updateMany({
    where: { patientId, clinicianId },
    data: { status: "inactive" },
  });
}

export async function getCliniciansForPatient(patientId: string) {
  const links = await prisma.patientClinicianLink.findMany({
    where: { patientId, status: "active" },
    include: { clinician: true },
    orderBy: { createdAt: "desc" },
  });
  return links.map((l) => l.clinician);
}

export async function searchPatientsByEmail(email: string, clinicianId: string) {
  const patients = await prisma.user.findMany({
    where: {
      role: "PATIENT",
      email: { contains: email, mode: "insensitive" },
    },
    take: 10,
  });

  // Check which are already linked
  const links = await prisma.patientClinicianLink.findMany({
    where: {
      clinicianId,
      patientId: { in: patients.map((p) => p.id) },
      status: "active",
    },
  });

  const linkedIds = new Set(links.map((l) => l.patientId));

  return patients.map((p) => ({
    ...p,
    isLinked: linkedIds.has(p.id),
  }));
}
