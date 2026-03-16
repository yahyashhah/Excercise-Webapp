import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getPatientDetail } from "@/lib/services/patient.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlanStatusBadge } from "@/components/workout/plan-status-badge";
import { ArrowLeft, BarChart3, Activity, MessageSquare } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PatientDetailPage({ params }: Props) {
  const { id } = await params;
  await requireRole("CLINICIAN");
  const patient = await getPatientDetail(id);

  if (!patient) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/patients">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      {/* Patient info */}
      <Card>
        <CardContent className="flex items-center gap-6 p-6">
          <Avatar className="h-16 w-16">
            <AvatarImage src={patient.imageUrl || undefined} />
            <AvatarFallback className="text-lg">
              {patient.firstName[0]}{patient.lastName[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {patient.firstName} {patient.lastName}
            </h2>
            <p className="text-slate-500">{patient.email}</p>
            {patient.dateOfBirth && (
              <p className="text-sm text-slate-400">DOB: {patient.dateOfBirth}</p>
            )}
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/messages/${patient.id}`}>
                <MessageSquare className="mr-1 h-4 w-4" />
                Message
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/patients/${id}/adherence`}>
                <Activity className="mr-1 h-4 w-4" />
                Adherence
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/patients/${id}/outcomes`}>
                <BarChart3 className="mr-1 h-4 w-4" />
                Outcomes
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Patient profile */}
      {patient.patientProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Health Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {patient.patientProfile.limitations && (
              <div>
                <span className="font-medium text-slate-700">Limitations: </span>
                <span className="text-slate-600">{patient.patientProfile.limitations}</span>
              </div>
            )}
            {patient.patientProfile.comorbidities && (
              <div>
                <span className="font-medium text-slate-700">Conditions: </span>
                <span className="text-slate-600">{patient.patientProfile.comorbidities}</span>
              </div>
            )}
            {patient.patientProfile.fitnessGoals.length > 0 && (
              <div>
                <span className="font-medium text-slate-700">Goals: </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {patient.patientProfile.fitnessGoals.map((g) => (
                    <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>
                  ))}
                </div>
              </div>
            )}
            {patient.patientProfile.availableEquipment.length > 0 && (
              <div>
                <span className="font-medium text-slate-700">Equipment: </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {patient.patientProfile.availableEquipment.map((eq) => (
                    <Badge key={eq} variant="outline" className="text-xs">{eq}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Plans */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workout Plans</CardTitle>
        </CardHeader>
        <CardContent>
          {patient.plansAsPatient.length === 0 ? (
            <p className="text-sm text-slate-500">No plans assigned.</p>
          ) : (
            <div className="space-y-3">
              {patient.plansAsPatient.map((plan) => (
                <Link
                  key={plan.id}
                  href={`/workout-plans/${plan.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">{plan.title}</p>
                    <p className="text-xs text-slate-500">
                      {plan._count.exercises} exercises | {plan._count.sessions} sessions
                    </p>
                  </div>
                  <PlanStatusBadge status={plan.status} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
