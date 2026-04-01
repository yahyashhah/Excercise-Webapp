import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getPatientDetail } from "@/lib/services/patient.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlanStatusBadge } from "@/components/workout/plan-status-badge";
import {
  ArrowLeft, BarChart3, Activity, MessageSquare,
  Mail, Calendar, Briefcase, AlertTriangle, Target, Dumbbell,
} from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PatientDetailPage({ params }: Props) {
  const { id } = await params;
  await requireRole("CLINICIAN");
  const patient = await getPatientDetail(id);

  if (!patient) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = patient.patientProfile as any;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/patients">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Clients
        </Link>
      </Button>

      {/* Patient hero card */}
      <Card className="border-border/60 overflow-hidden">
        <div className="h-1.5 w-full bg-linear-to-r from-blue-500 via-indigo-500 to-violet-500" />
        <CardContent className="p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 ring-2 ring-primary/15 shadow-sm">
                <AvatarImage src={patient.imageUrl || undefined} />
                <AvatarFallback className="bg-primary/8 text-primary text-xl font-bold">
                  {patient.firstName[0]}{patient.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {patient.firstName} {patient.lastName}
                </h2>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {patient.email}
                </div>
                {patient.dateOfBirth && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    DOB: {patient.dateOfBirth}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/messages/${patient.id}`}>
                  <MessageSquare className="mr-1.5 h-4 w-4" />
                  Message
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/patients/${id}/adherence`}>
                  <Activity className="mr-1.5 h-4 w-4" />
                  Adherence
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/patients/${id}/outcomes`}>
                  <BarChart3 className="mr-1.5 h-4 w-4" />
                  Outcomes
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clinical Profile */}
      {profile && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Clinical Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Primary diagnosis */}
            {profile.primaryDiagnosis && (
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                  Primary Diagnosis
                </p>
                <p className="text-sm font-medium text-blue-900">{profile.primaryDiagnosis}</p>
                {profile.secondaryDiagnoses?.length > 0 && (
                  <p className="mt-1 text-xs text-blue-600">
                    Also: {profile.secondaryDiagnoses.join(", ")}
                  </p>
                )}
              </div>
            )}

            {/* Pain score */}
            {profile.painScore != null && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Pain Score
                  </div>
                  <span className="text-sm font-bold tabular-nums">
                    {profile.painScore}
                    <span className="text-muted-foreground font-normal">/10</span>
                  </span>
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-2 flex-1 rounded-full transition-colors ${
                        i < profile.painScore
                          ? i < 3 ? "bg-emerald-400" : i < 6 ? "bg-amber-400" : "bg-red-500"
                          : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Grid info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {profile.activityLevel && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Activity Level</p>
                  <p className="font-medium capitalize">{profile.activityLevel.toLowerCase()}</p>
                </div>
              )}
              {profile.occupation && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Occupation</p>
                  <div className="flex items-center gap-1.5 font-medium">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                    {profile.occupation}
                  </div>
                </div>
              )}
              {profile.injuryDate && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Injury Date</p>
                  <p className="font-medium">{new Date(profile.injuryDate).toLocaleDateString()}</p>
                </div>
              )}
            </div>

            {profile.surgeryHistory && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Surgery History</p>
                <p className="text-sm text-foreground">{profile.surgeryHistory}</p>
              </div>
            )}
            {patient.patientProfile?.limitations && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Limitations</p>
                <p className="text-sm text-foreground">{patient.patientProfile.limitations}</p>
              </div>
            )}
            {patient.patientProfile?.comorbidities && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Comorbidities</p>
                <p className="text-sm text-foreground">{patient.patientProfile.comorbidities}</p>
              </div>
            )}

            {/* Goals */}
            {patient.patientProfile?.fitnessGoals && patient.patientProfile.fitnessGoals.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Target className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Goals</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {patient.patientProfile.fitnessGoals.map((g) => (
                    <Badge key={g} variant="secondary" className="text-xs bg-primary/8 text-primary border-0">
                      {g}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Equipment */}
            {patient.patientProfile?.availableEquipment && patient.patientProfile.availableEquipment.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Dumbbell className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Equipment</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {patient.patientProfile.availableEquipment.map((eq) => (
                    <Badge key={eq} variant="outline" className="text-xs border-border/60">
                      {eq}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Workout Plans */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Workout Plans</CardTitle>
        </CardHeader>
        <CardContent>
          {patient.plansAsPatient.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No plans assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {patient.plansAsPatient.map((plan) => (
                <Link
                  key={plan.id}
                  href={`/workout-plans/${plan.id}`}
                  className="flex items-center justify-between rounded-lg border border-border/60 p-3.5 transition-all hover:bg-muted/40 hover:border-primary/20 group"
                >
                  <div>
                    <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                      {plan.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {plan._count.exercises} exercises · {plan._count.sessions} sessions
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
