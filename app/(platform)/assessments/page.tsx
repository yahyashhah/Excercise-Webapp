import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getAssessments } from "@/lib/services/outcome.service";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils/formatting";

export default async function AssessmentsPage() {
  const user = await getCurrentUser();

  let assessments;
  if (user.role === "CLINICIAN") {
    // Get assessments for all linked patients
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Assessments</h2>
          <p className="text-slate-600">
            Track measurements and outcomes over time
          </p>
        </div>
        <Button asChild>
          <Link href="/assessments/new">
            <Plus className="mr-2 h-4 w-4" />
            New Assessment
          </Link>
        </Button>
      </div>

      {assessments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center">
          <p className="text-slate-500">No assessments recorded yet.</p>
          <Button className="mt-4" asChild>
            <Link href="/assessments/new">Record First Assessment</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium capitalize text-slate-900">
                    {a.assessmentType.replace(/_/g, " ")}
                  </p>
                  {"patient" in a && a.patient && (
                    <p className="text-sm font-medium text-blue-600">
                      {a.patient.firstName} {a.patient.lastName}
                    </p>
                  )}
                  {a.notes && (
                    <p className="text-sm text-slate-500">{a.notes}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900">
                    {a.value} {a.unit}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatDate(a.createdAt)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
