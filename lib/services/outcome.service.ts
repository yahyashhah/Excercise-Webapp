import { prisma } from "@/lib/prisma";

export async function recordAssessment(data: {
  patientId: string;
  assessedById?: string;
  assessmentType: string;
  value: number;
  unit: string;
  notes?: string;
}) {
  return prisma.assessment.create({ data });
}

export async function getAssessments(patientId: string, assessmentType?: string) {
  return prisma.assessment.findMany({
    where: {
      patientId,
      ...(assessmentType && { assessmentType }),
    },
    include: { assessedByUser: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProgressTimeline(patientId: string, assessmentType: string) {
  return prisma.assessment.findMany({
    where: { patientId, assessmentType },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      value: true,
      unit: true,
      notes: true,
      createdAt: true,
    },
  });
}

export async function getLatestAssessments(patientId: string) {
  const assessmentTypes = await prisma.assessment.findMany({
    where: { patientId },
    distinct: ["assessmentType"],
    select: { assessmentType: true },
  });

  const latest = await Promise.all(
    assessmentTypes.map(({ assessmentType }) =>
      prisma.assessment.findFirst({
        where: { patientId, assessmentType },
        orderBy: { createdAt: "desc" },
      })
    )
  );

  return latest.filter(Boolean);
}
