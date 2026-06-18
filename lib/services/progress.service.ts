import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Progress Photos
// ---------------------------------------------------------------------------

export async function getProgressPhotos(clientId: string) {
  return prisma.progressPhoto.findMany({
    where: { clientId },
    orderBy: { recordedAt: "desc" },
  });
}

export async function addProgressPhoto(
  clientId: string,
  imageUrl: string,
  angle?: string,
  notes?: string
) {
  return prisma.progressPhoto.create({
    data: {
      clientId,
      imageUrl,
      angle,
      notes,
      recordedAt: new Date(),
    },
  });
}

export async function deleteProgressPhoto(id: string, clientId: string) {
  // Verify ownership before deleting
  const photo = await prisma.progressPhoto.findUnique({ where: { id } });
  if (!photo || photo.clientId !== clientId) {
    throw new Error("Photo not found or access denied");
  }
  return prisma.progressPhoto.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Body Metrics
// ---------------------------------------------------------------------------

export async function getBodyMetrics(clientId: string, metricType?: string) {
  return prisma.bodyMetric.findMany({
    where: {
      clientId,
      ...(metricType ? { metricType } : {}),
    },
    // Ascending order so Recharts can render a chronological line chart
    orderBy: { recordedAt: "asc" },
  });
}

export async function addBodyMetric(
  clientId: string,
  metricType: string,
  value: number,
  unit: string,
  notes?: string
) {
  return prisma.bodyMetric.create({
    data: {
      clientId,
      metricType,
      value,
      unit,
      notes,
      recordedAt: new Date(),
    },
  });
}

/** Returns all distinct metric types this client has recorded. */
export async function getBodyMetricTypes(clientId: string): Promise<string[]> {
  const rows = await prisma.bodyMetric.findMany({
    where: { clientId },
    select: { metricType: true },
    distinct: ["metricType"],
    orderBy: { metricType: "asc" },
  });
  return rows.map((r) => r.metricType);
}

/** Returns the single most-recent reading per metric type. */
export async function getLatestBodyMetrics(
  clientId: string
): Promise<{ metricType: string; value: number; unit: string; recordedAt: Date }[]> {
  const types = await getBodyMetricTypes(clientId);

  const latestPerType = await Promise.all(
    types.map((metricType) =>
      prisma.bodyMetric.findFirst({
        where: { clientId, metricType },
        orderBy: { recordedAt: "desc" },
        select: { metricType: true, value: true, unit: true, recordedAt: true },
      })
    )
  );

  return latestPerType.filter(
    (r): r is NonNullable<typeof r> => r !== null
  );
}
