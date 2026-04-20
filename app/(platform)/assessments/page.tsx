import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getAssessments } from "@/lib/services/outcome.service";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, BarChart3, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/utils/formatting";

// Color-code assessment value based on pain/functional scores
const assessmentColors = [
  "from-blue-400 to-indigo-500",
  "from-emerald-400 to-teal-500",
  "from-violet-400 to-purple-500",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
  "from-cyan-400 to-blue-500",
];

function getAssessmentColor(type: string) {
  return assessmentColors[type.charCodeAt(0) % assessmentColors.length];
}

function formatAssessmentType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function AssessmentsPage() {
  const user = await getCurrentUser();

  let assessments;
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Assessments</h2>
          <p className="text-muted-foreground">
            {assessments.length > 0
              ? `${assessments.length} measurement${assessments.length !== 1 ? "s" : ""} recorded`
              : "Track measurements and outcomes over time"}
          </p>
        </div>
        <Button
          className="gap-2 bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-600"
          asChild
        >
          <Link href="/assessments/new">
            <Plus className="h-4 w-4" />
            New Assessment
          </Link>
        </Button>
      </div>

      {assessments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="mt-5 text-lg font-semibold">No assessments yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Record measurements over time to track patient progress and outcomes.
          </p>
          <Button
            className="mt-5 gap-2 bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-600"
            asChild
          >
            <Link href="/assessments/new">
              <Plus className="h-4 w-4" />
              Record First Assessment
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {assessments.map((a) => {
            const gradient = getAssessmentColor(a.assessmentType);
            return (
              <Card
                key={a.id}
                className="group relative overflow-hidden border-0 shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-border"
              >
                {/* Left color accent */}
                <div className={`absolute inset-y-0 left-0 w-1 bg-linear-to-b ${gradient}`} />

                <CardContent className="flex items-center gap-5 py-4 pl-6 pr-5">
                  {/* Icon */}
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${gradient} shadow-sm`}>
                    <TrendingUp className="h-4.5 w-4.5 text-white" />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight">
                      {formatAssessmentType(a.assessmentType)}
                    </p>
                    {"patient" in a && a.patient && (
                      <p className="mt-0.5 text-sm font-medium text-primary">
                        {a.patient.firstName} {a.patient.lastName}
                      </p>
                    )}
                    {a.notes && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.notes}</p>
                    )}
                  </div>

                  {/* Value + date */}
                  <div className="shrink-0 text-right">
                    <p className="text-xl font-bold leading-none">
                      {a.value}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">{a.unit}</span>
                    </p>
                    <Badge
                      variant="outline"
                      className="mt-1.5 h-5 border-border/60 px-1.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {formatDate(a.createdAt)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
