import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getAssessments } from "@/lib/services/outcome.service";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { formatDate } from "@/lib/utils/formatting";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PatientOutcomesPage({ params }: Props) {
  const { id } = await params;
  await requireRole("CLINICIAN");

  const patient = await prisma.user.findUnique({ where: { id } });
  if (!patient) notFound();

  const assessments = await getAssessments(id);

  // Group by type
  const grouped = assessments.reduce<Record<string, typeof assessments>>((acc, a) => {
    const key = a.assessmentType;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

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
          Outcomes: {patient.firstName} {patient.lastName}
        </h2>
      </div>

      {assessments.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-slate-500">No assessments recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([type, items]) => (
          <Card key={type}>
            <CardHeader>
              <CardTitle className="text-base capitalize">{type.replace(/_/g, " ")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {items.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {a.value} {a.unit}
                      </p>
                      {a.notes && <p className="text-xs text-slate-500">{a.notes}</p>}
                    </div>
                    <p className="text-xs text-slate-400">{formatDate(a.createdAt)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
