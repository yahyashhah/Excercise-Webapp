import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getPatientDetail } from "@/lib/services/patient.service";
import * as sessionService from "@/lib/services/session.service";
import * as programService from "@/lib/services/program.service";
import { getExercisesForPicker } from "@/lib/services/exercise.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlanStatusBadge } from "@/components/workout/plan-status-badge";
import { ArrowLeft, BarChart3, Activity, MessageSquare } from "lucide-react";
import { ClientCalendar } from "@/components/calendar/client-calendar";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PatientDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await requireRole("CLINICIAN");
  const patient = await getPatientDetail(id);

  if (!patient) notFound();

  // Fetch V2 sessions, programs, and exercise library for the calendar
  const [v2Sessions, assignedPrograms, exerciseLibrary] = await Promise.all([
    sessionService.getSessionsForPatient(patient.id),
    programService.getProgramsForPatient(patient.id),
    getExercisesForPicker(),
  ]);

  // Transform sessions to the shape the calendar expects
  const calendarSessions = v2Sessions.map((s) => ({
    id: s.id,
    scheduledDate: s.scheduledDate,
    status: s.status,
    workout: {
      id: s.workout.id,
      name: s.workout.name,
      blocks: s.workout.blocks.map((b) => ({
        exercises: b.exercises.map((e) => ({ id: e.id })),
      })),
    },
  }));

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
            <CardTitle className="text-base">Clinical Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(patient.patientProfile as any).primaryDiagnosis && (
              <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2">
                <span className="font-semibold text-blue-800">Primary Diagnosis: </span>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <span className="text-blue-700">{(patient.patientProfile as any).primaryDiagnosis}</span>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(patient.patientProfile as any).secondaryDiagnoses?.length > 0 && (
                  <p className="mt-0.5 text-xs text-blue-600">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    Also: {(patient.patientProfile as any).secondaryDiagnoses.join(", ")}
                  </p>
                )}
              </div>
            )}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(patient.patientProfile as any).painScore != null && (
              <div className="flex items-center gap-3">
                <span className="font-medium text-slate-700">Pain Score:</span>
                <div className="flex items-center gap-1.5">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-2.5 w-2.5 rounded-full ${
                        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                        i < (patient.patientProfile as any).painScore
                          ? i < 3 ? "bg-green-400" : i < 6 ? "bg-amber-400" : "bg-red-500"
                          : "bg-slate-200"
                      }`}
                    />
                  ))}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <span className="ml-1 text-slate-600">{(patient.patientProfile as any).painScore}/10</span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(patient.patientProfile as any).activityLevel && (
                <div>
                  <span className="font-medium text-slate-700">Activity Level: </span>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <span className="text-slate-600 capitalize">{((patient.patientProfile as any).activityLevel as string).toLowerCase()}</span>
                </div>
              )}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(patient.patientProfile as any).occupation && (
                <div>
                  <span className="font-medium text-slate-700">Occupation: </span>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <span className="text-slate-600">{(patient.patientProfile as any).occupation}</span>
                </div>
              )}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(patient.patientProfile as any).injuryDate && (
                <div>
                  <span className="font-medium text-slate-700">Injury Date: </span>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <span className="text-slate-600">{new Date((patient.patientProfile as any).injuryDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(patient.patientProfile as any).surgeryHistory && (
              <div>
                <span className="font-medium text-slate-700">Surgery History: </span>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <span className="text-slate-600">{(patient.patientProfile as any).surgeryHistory}</span>
              </div>
            )}
            {patient.patientProfile.limitations && (
              <div>
                <span className="font-medium text-slate-700">Limitations: </span>
                <span className="text-slate-600">{patient.patientProfile.limitations}</span>
              </div>
            )}
            {patient.patientProfile.comorbidities && (
              <div>
                <span className="font-medium text-slate-700">Comorbidities: </span>
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

      {/* Tabbed content: Calendar (default), Programs, Plans */}
      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="programs">Programs ({assignedPrograms.length})</TabsTrigger>
          </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <ClientCalendar
            patientId={patient.id}
            clinicianId={user.id}
            initialSessions={calendarSessions}
            exerciseLibrary={exerciseLibrary}
          />
        </TabsContent>

        <TabsContent value="programs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assigned Programs</CardTitle>
            </CardHeader>
            <CardContent>
              {assignedPrograms.length === 0 ? (
                <p className="text-sm text-slate-500">No programs assigned yet.</p>
              ) : (
                <div className="space-y-3">
                  {assignedPrograms.map((prog) => (
                    <Link
                      key={prog.id}
                      href={`/programs/${prog.id}`}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{prog.name}</p>
                        <p className="text-xs text-slate-500">
                          {prog._count.workouts} workouts
                        </p>
                      </div>
                      <Badge
                        className={
                          prog.status === "ACTIVE"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        }
                      >
                        {prog.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        
      </Tabs>
    </div>
  );
}
