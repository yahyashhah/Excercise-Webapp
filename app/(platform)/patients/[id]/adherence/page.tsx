import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getAdherenceStats, getSessionsForPatient } from "@/lib/services/adherence.service";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft } from "lucide-react";
import { formatDate, formatSessionStatus } from "@/lib/utils/formatting";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PatientAdherencePage({ params }: Props) {
  const { id } = await params;
  await requireRole("CLINICIAN");

  const patient = await prisma.user.findUnique({ where: { id } });
  if (!patient) notFound();

  const [stats, sessions] = await Promise.all([
    getAdherenceStats(id),
    getSessionsForPatient(id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/patients/${id}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <h2 className="text-xl font-bold text-slate-900">
          Adherence: {patient.firstName} {patient.lastName}
        </h2>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{stats.completionRate}%</p>
            <p className="text-sm text-slate-500">Completion Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{stats.completedSessions}</p>
            <p className="text-sm text-slate-500">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{stats.abandonedSessions}</p>
            <p className="text-sm text-slate-500">Abandoned</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{stats.avgPainLevel}/10</p>
            <p className="text-sm text-slate-500">Avg Pain</p>
          </CardContent>
        </Card>
      </div>

      {/* Completion bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overall Completion</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={stats.completionRate} className="h-3" />
          <p className="mt-2 text-sm text-slate-500">
            {stats.completedSessions} of {stats.totalSessions} sessions completed
          </p>
        </CardContent>
      </Card>

      {/* Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session History</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-500">No sessions recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {sessions.slice(0, 20).map((session) => (
                <div key={session.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div>
                    <p className="font-medium text-slate-900">{session.plan.title}</p>
                    <p className="text-xs text-slate-500">{formatDate(session.startedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {session.overallPainLevel !== null && (
                      <span className="text-xs text-slate-500">Pain: {session.overallPainLevel}/10</span>
                    )}
                    <Badge variant={session.status === "COMPLETED" ? "secondary" : "destructive"}>
                      {formatSessionStatus(session.status)}
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
