"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Pencil,
  Copy,
  UserPlus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { duplicateProgramAction } from "@/actions/program-actions";
import { AssignProgramDialog } from "@/components/programs/assign-program-dialog";
import { CalendarWithSidebar } from "@/components/calendar/calendar-with-sidebar";
import { ExerciseImage } from "@/components/exercises/exercise-image";
import { format } from "date-fns";

interface ProgramDetailViewProps {
  program: Record<string, unknown>;
  isClinician: boolean;
  patients: { id: string; firstName: string; lastName: string }[];
  sessions: Record<string, unknown>[];
  showAssignDialog?: boolean;
}

export function ProgramDetailView({
  program,
  isClinician,
  patients,
  sessions,
  showAssignDialog = false,
}: ProgramDetailViewProps) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(showAssignDialog);
  const workouts = (program.workouts as Record<string, unknown>[]) || [];
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(
    new Set(workouts.map((w) => w.id as string))
  );

  function toggleWorkout(id: string) {
    setExpandedWorkouts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const patient = program.patient as Record<string, string> | null;
  const patientId = program.patientId as string | null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {program.name as string}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge>{program.status as string}</Badge>
            {(program.isTemplate as boolean) && (
              <Badge variant="outline">Template</Badge>
            )}
            {patient && (
              <span className="text-sm text-muted-foreground">
                Assigned to {patient.firstName} {patient.lastName}
              </span>
            )}
            {!!program.startDate && (
              <span className="text-sm text-muted-foreground">
                Starts{" "}
                {format(new Date(program.startDate as string), "MMM d, yyyy")}
              </span>
            )}
          </div>
          {!!program.description && (
            <p className="text-muted-foreground mt-2">
              {program.description as string}
            </p>
          )}
        </div>
        {isClinician && (
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/programs/${program.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const r = await duplicateProgramAction(
                  program.id as string
                );
                if (r.success) {
                  toast.success("Duplicated");
                  router.refresh();
                } else toast.error(r.error);
              }}
            >
              <Copy className="mr-2 h-4 w-4" /> Duplicate
            </Button>
            {!patientId && (
              <Button onClick={() => setAssignOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Assign
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4 mt-4">
          {workouts.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">
                No workouts yet. Edit this program to add workouts.
              </p>
            </Card>
          ) : (
            workouts.map((workout) => {
              const wId = workout.id as string;
              const isExpanded = expandedWorkouts.has(wId);
              const blocks =
                (workout.blocks as Record<string, unknown>[]) || [];
              return (
                <Card key={wId}>
                  <CardHeader
                    className="cursor-pointer flex flex-row items-center gap-2"
                    onClick={() => toggleWorkout(wId)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5" />
                    ) : (
                      <ChevronRight className="h-5 w-5" />
                    )}
                    <CardTitle className="text-lg">
                      {workout.name as string}
                    </CardTitle>
                    <span className="text-sm text-muted-foreground ml-auto">
                      Week {(workout.weekIndex as number) + 1}, Day{" "}
                      {(workout.dayIndex as number) + 1}
                      {!!workout.estimatedMinutes &&
                        ` | ~${workout.estimatedMinutes as number} min`}
                    </span>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="space-y-4">
                      {blocks.map((block) => {
                        const bExercises =
                          (block.exercises as Record<string, unknown>[]) ||
                          [];
                        return (
                          <div
                            key={block.id as string}
                            className="border rounded-lg p-4"
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <span className="font-semibold">
                                {(block.name as string) || "Block"}
                              </span>
                              {(block.type as string) !== "NORMAL" && (
                                <Badge variant="outline">
                                  {block.type as string}
                                </Badge>
                              )}
                              {(block.rounds as number) > 1 && (
                                <Badge variant="secondary">
                                  {block.rounds as number} rounds
                                </Badge>
                              )}
                            </div>
                            <div className="space-y-3">
                              {bExercises.map((be) => {
                                const exercise =
                                  be.exercise as Record<string, unknown>;
                                const sets =
                                  (be.sets as Record<string, unknown>[]) ||
                                  [];
                                return (
                                  <div
                                    key={be.id as string}
                                      className="flex items-start gap-4 p-3 bg-muted/50 rounded-md"
                                    >
                                      {!!(exercise?.imageUrl || exercise?.videoUrl) && (
                                        <div className="w-16 h-16 rounded overflow-hidden shrink-0 relative bg-secondary">
                                          <ExerciseImage
                                            src={exercise.imageUrl as string}
                                            alt={exercise.name as string}
                                            bodyRegion={exercise.bodyRegion as string}
                                            videoUrl={exercise.videoUrl as string}
                                          />
                                        </div>
                                      )}
                                    <div className="flex-1">
                                      <p className="font-medium">
                                        {exercise?.name as string}
                                      </p>
                                      {!!be.notes && (
                                        <p className="text-sm text-muted-foreground">
                                          {be.notes as string}
                                        </p>
                                      )}
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {sets.map((set) => (
                                          <Badge
                                            key={set.id as string}
                                            variant="secondary"
                                            className="text-xs"
                                          >
                                            {(set.setType as string) !== "NORMAL" &&
                                              `${set.setType as string} `}
                                            {!!(set.targetReps) &&
                                              `${set.targetReps as number} reps`}
                                            {!!(set.targetWeight) &&
                                              ` @ ${set.targetWeight as number}lb`}
                                            {!!(set.targetDuration) &&
                                              ` ${set.targetDuration as number}s`}
                                            {!!(set.targetRPE) &&
                                              ` RPE ${set.targetRPE as number}`}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                    {!!be.restSeconds && (
                                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                                        Rest: {be.restSeconds as number}s
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <CalendarWithSidebar
            sessions={sessions}
            isClinician={isClinician}
          />
        </TabsContent>
      </Tabs>

      {/* Assign Dialog */}
      <AssignProgramDialog
        programId={program.id as string}
        patients={patients}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />
    </div>
  );
}
