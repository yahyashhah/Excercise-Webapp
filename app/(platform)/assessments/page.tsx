import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getAssessments } from "@/lib/services/outcome.service";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, BarChart3, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/utils/formatting";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

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
  if (user.role === "TRAINER") {
    const clientIds = await getClientIdsForTrainer(user.id);
    assessments = await prisma.assessment.findMany({
      where: { clientId: { in: clientIds } },
      include: {
        client: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  } else {
    assessments = await getAssessments(user.id);
  }

  return (
    <div>
      <PageHeader
        title="Assessments"
        description={
          assessments.length > 0
            ? `${assessments.length} measurement${assessments.length !== 1 ? "s" : ""} recorded`
            : "Track measurements and outcomes over time"
        }
        action={
          <Button className="gap-2" asChild>
            <Link href="/assessments/new">
              <Plus className="h-4 w-4" />
              New Assessment
            </Link>
          </Button>
        }
      />

      {assessments.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No assessments yet"
          description="Record measurements over time to track client progress and outcomes."
          actionLabel="Record First Assessment"
          actionHref="/assessments/new"
        />
      ) : (
        <div className="space-y-2.5">
          {assessments.map((a) => {
            const gradient = getAssessmentColor(a.assessmentType);
            return (
              <Card
                key={a.id}
                className="group border-0 shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-border"
              >
                <CardContent className="flex items-center gap-5 py-4 px-5">
                  {/* Icon */}
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${gradient} shadow-sm`}>
                    <TrendingUp className="h-4.5 w-4.5 text-white" />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight">
                      {formatAssessmentType(a.assessmentType)}
                    </p>
                    {"client" in a && a.client && (
                      <p className="mt-0.5 text-sm font-medium text-primary">
                        {a.client.firstName} {a.client.lastName}
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
