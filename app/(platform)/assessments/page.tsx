import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getAssessments } from "@/lib/services/outcome.service";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, Plus, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatDate } from "@/lib/utils/formatting";

export default async function AssessmentsPage() {
  const user = await getCurrentUser();

  let assessments: Array<{
    id: string;
    assessmentType: string;
    value: number;
    unit: string;
    notes: string | null;
    createdAt: Date;
    patient?: { firstName: string; lastName: string } | null;
  }>;

  if (user.role === "CLINICIAN") {
    const linkedPatients = await prisma.patientClinicianLink.findMany({
      where: { clinicianId: user.id, status: "active" },
      select: { patientId: true },
    });
    const patientIds = linkedPatients.map((l) => l.patientId);
    assessments = await prisma.assessment.findMany({
      where: { patientId: { in: patientIds } },
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  } else {
    assessments = await getAssessments(user.id);
  }

  // Group by assessment type for trend indicators
  const byType = new Map<string, number[]>();
  for (const a of assessments) {
    if (!byType.has(a.assessmentType)) byType.set(a.assessmentType, []);
    byType.get(a.assessmentType)!.push(a.value);
  }

  function getTrend(type: string, value: number) {
    const values = byType.get(type) ?? [];
    const idx = values.indexOf(value);
    if (idx === values.length - 1) return null; // oldest, no comparison
    const prev = values[idx + 1];
    if (value > prev) return "up";
    if (value < prev) return "down";
    return "same";
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assessments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track measurements and outcomes over time
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/assessments/new">
            <Plus className="mr-2 h-4 w-4" />
            New Assessment
          </Link>
        </Button>
      </div>

      {assessments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <BarChart3 className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <h3 className="mt-4 text-base font-semibold">No assessments yet</h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Record your first assessment to start tracking outcomes over time.
          </p>
          <Button className="mt-5" asChild>
            <Link href="/assessments/new">Record First Assessment</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {assessments.map((a) => {
            const trend = getTrend(a.assessmentType, a.value);
            const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
            const trendColor =
              trend === "up"
                ? "text-emerald-600"
                : trend === "down"
                  ? "text-red-500"
                  : "text-muted-foreground";

            return (
              <div
                key={a.id}
                className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 transition-colors hover:bg-muted/30"
              >
                {/* Icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                  <BarChart3 className="h-5 w-5" />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground capitalize text-sm">
                    {a.assessmentType.replace(/_/g, " ").toLowerCase()}
                  </p>
                  {"patient" in a && a.patient && (
                    <p className="text-xs font-medium text-primary mt-0.5">
                      {a.patient.firstName} {a.patient.lastName}
                    </p>
                  )}
                  {a.notes && (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{a.notes}</p>
                  )}
                </div>

                {/* Value + trend */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-2">
                    {trend && (
                      <TrendIcon className={`h-4 w-4 ${trendColor}`} />
                    )}
                    <p className="text-xl font-bold text-foreground tabular-nums">
                      {a.value}
                      <span className="ml-1 text-sm font-medium text-muted-foreground">{a.unit}</span>
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
