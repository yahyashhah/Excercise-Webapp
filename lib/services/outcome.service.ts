import { prisma } from "@/lib/prisma";

export async function recordAssessment(data: {
  clientId: string;
  assessedById?: string;
  assessmentType: string;
  value: number;
  unit: string;
  notes?: string;
}) {
  return prisma.assessment.create({ data });
}

export async function getAssessments(clientId: string, assessmentType?: string) {
  return prisma.assessment.findMany({
    where: {
      clientId,
      ...(assessmentType && { assessmentType }),
    },
    include: { assessedByUser: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProgressTimeline(clientId: string, assessmentType: string) {
  return prisma.assessment.findMany({
    where: { clientId, assessmentType },
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

export async function getLatestAssessments(clientId: string) {
  const assessmentTypes = await prisma.assessment.findMany({
    where: { clientId },
    distinct: ["assessmentType"],
    select: { assessmentType: true },
  });

  const latest = await Promise.all(
    assessmentTypes.map(({ assessmentType }) =>
      prisma.assessment.findFirst({
        where: { clientId, assessmentType },
        orderBy: { createdAt: "desc" },
      })
    )
  );

  return latest.filter(Boolean);
}
