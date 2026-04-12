import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getAssessments } from "@/lib/services/outcome.service";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, BarChart3 } from "lucide-react";
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
          <h2 className="text-2xl font-bold">Assessments</h2>
          <p className="text-muted-foreground">
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
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-4 font-semibold">No assessments yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Record measurements over time to track patient progress.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/assessments/new">
              <Plus className="mr-2 h-4 w-4" />
              Record First Assessment
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map((a) => (
            <Card key={a.id} className="transition-shadow hover:shadow-sm">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium capitalize">
                    {a.assessmentType.replace(/_/g, " ")}
                  </p>
                  {"patient" in a && a.patient && (
                    <p className="text-sm font-medium text-primary">
                      {a.patient.firstName} {a.patient.lastName}
                    </p>
                  )}
                  {a.notes && (
                    <p className="text-sm text-muted-foreground">{a.notes}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">
                    {a.value} {a.unit}
                  </p>
                  <p className="text-xs text-muted-foreground">
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
