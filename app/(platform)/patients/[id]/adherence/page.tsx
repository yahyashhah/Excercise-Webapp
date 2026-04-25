import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";

interface Props {
  params: Promise<{ id: string }>;
}

const statusColors: Record<string, string> = {
  COMPLETED:   "bg-emerald-100 text-emerald-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  SCHEDULED:   "bg-blue-100 text-blue-700",
  MISSED:      "bg-red-100 text-red-700",
  SKIPPED:     "bg-slate-100 text-slate-600",
};

export default async function PatientAdherencePage({ params }: Props) {
  const { id } = await params;
  await requireRole("CLINICIAN");

  const patient = await prisma.user.findUnique({ where: { id } });
  if (!patient) notFound();

  const sessions = await prisma.workoutSessionV2.findMany({
    where: { patientId: id },
    include: {
      workout: {
        select: {
          name: true,
          program: { select: { name: true } },
        },
      },
    },
    orderBy: { scheduledDate: "desc" },
    take: 50,
  });

  const total     = sessions.length;
  const completed = sessions.filter((s) => s.status === "COMPLETED").length;
  const missed    = sessions.filter((s) => s.status === "MISSED").length;
  const skipped   = sessions.filter((s) => s.status === "SKIPPED").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const sessionsWithRPE = sessions.filter((s) => s.overallRPE != null);
  const avgRPE =
    sessionsWithRPE.length > 0
      ? Math.round(
          (sessionsWithRPE.reduce((sum, s) => sum + (s.overallRPE ?? 0), 0) /
            sessionsWithRPE.length) *
            10
        ) / 10
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/patients/${id}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <h2 className="text-xl font-bold">
          Adherence — {patient.firstName} {patient.lastName}
        </h2>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{completionRate}%</p>
            <p className="text-sm text-muted-foreground">Completion Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{completed}</p>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{missed + skipped}</p>
            <p className="text-sm text-muted-foreground">Missed / Skipped</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{avgRPE != null ? `${avgRPE}/10` : "—"}</p>
            <p className="text-sm text-muted-foreground">Avg RPE</p>
          </CardContent>
        </Card>
      </div>

      {/* Completion bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overall Completion</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={completionRate} className="h-3" />
          <p className="mt-2 text-sm text-muted-foreground">
            {completed} of {total} sessions completed
          </p>
        </CardContent>
      </Card>

      {/* Session history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session History</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {session.workout.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(session.scheduledDate), "MMM d, yyyy")}
                      {session.workout.program?.name && (
                        <span className="ml-2 opacity-60">· {session.workout.program.name}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {session.overallRPE != null && (
                      <span className="text-xs text-muted-foreground">RPE {session.overallRPE}/10</span>
                    )}
                    <Badge
                      className={`border-0 text-xs font-medium ${statusColors[session.status] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {session.status.charAt(0) + session.status.slice(1).toLowerCase()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
