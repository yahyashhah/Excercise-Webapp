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
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { duplicateProgramAction } from "@/actions/program-actions";
import { AssignProgramDialog } from "@/components/programs/assign-program-dialog";
import { CalendarWithSidebar } from "@/components/calendar/calendar-with-sidebar";
import { UniversalVideoPlayer } from "@/components/exercises/universal-video-player";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [detailExercise, setDetailExercise] = useState<Record<string, unknown> | null>(null);
  const workouts = (program.workouts as Record<string, unknown>[]) || [];
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(
    new Set()
  );

  function summarizeSets(sets: Record<string, unknown>[]): string {
    if (sets.length === 0) return "";
    const first = sets[0];
    const allSame = sets.every(
      (s) =>
        s.targetReps === first.targetReps &&
        s.targetWeight === first.targetWeight &&
        s.targetDuration === first.targetDuration &&
        s.targetRPE === first.targetRPE &&
        s.setType === first.setType
    );
    const count = allSame ? sets.length : 1;
    const base = allSame ? first : sets[0];
    const prefix = (base.setType as string) !== "NORMAL" ? `${base.setType as string} ` : "";
    const reps = (base.targetReps as number) ? `${base.targetReps as number} reps` : "";
    const weight = (base.targetWeight as number) ? ` @ ${base.targetWeight as number}lb` : "";
    const dur = (base.targetDuration as number) ? ` ${base.targetDuration as number}s` : "";
    const rpe = (base.targetRPE as number) ? ` RPE ${base.targetRPE as number}` : "";
    const detail = `${prefix}${reps}${weight}${dur}${rpe}`.trim();
    if (allSame && sets.length > 1) return `${count} × ${detail}`;
    if (sets.length === 1) return detail;
    return sets
      .map((s) => {
        const p = (s.setType as string) !== "NORMAL" ? `${s.setType as string} ` : "";
        const r = (s.targetReps as number) ? `${s.targetReps as number} reps` : "";
        const w = (s.targetWeight as number) ? ` @ ${s.targetWeight as number}lb` : "";
        const d = (s.targetDuration as number) ? ` ${s.targetDuration as number}s` : "";
        return `${p}${r}${w}${d}`.trim();
      })
      .join(" | ");
  }

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
          {!!patientId && <TabsTrigger value="calendar">Schedule</TabsTrigger>}
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
                                    className="flex items-start gap-3 p-3 bg-muted/50 rounded-md"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                          type="button"
                                          className="font-medium text-sm text-left hover:underline focus:outline-none"
                                          onClick={() => setDetailExercise(exercise)}
                                        >
                                          {exercise?.name as string}
                                        </button>
                                        {!!(exercise?.videoUrl) && (
                                          <button
                                            type="button"
                                            className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-sm font-medium hover:bg-blue-100 transition-colors"
                                            onClick={() => setDetailExercise(exercise)}
                                          >
                                            <Play className="h-2.5 w-2.5" /> Watch
                                          </button>
                                        )}
                                      </div>
                                      {!!(exercise?.description) && (
                                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                          {exercise.description as string}
                                        </p>
                                      )}
                                      {!!be.notes && (
                                        <p className="text-xs text-muted-foreground mt-0.5 italic">
                                          {be.notes as string}
                                        </p>
                                      )}
                                      {sets.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                          <Badge variant="secondary" className="text-xs">
                                            {summarizeSets(sets)}
                                          </Badge>
                                          {!!be.restSeconds && (
                                            <Badge variant="outline" className="text-xs text-muted-foreground">
                                              Rest {be.restSeconds as number}s
                                            </Badge>
                                          )}
                                        </div>
                                      )}
                                    </div>
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
        {!!patientId && (
          <TabsContent value="calendar" className="mt-4">
            {sessions.length === 0 ? (
              <Card className="p-10 text-center">
                <p className="text-muted-foreground">
                  No sessions scheduled yet. Assign this program to place workouts on the calendar.
                </p>
              </Card>
            ) : (
              <CalendarWithSidebar
                sessions={sessions}
                isClinician={isClinician}
              />
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Assign Dialog */}
      <AssignProgramDialog
        programId={program.id as string}
        patients={patients}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />

      {/* Exercise Detail Modal */}
      <Dialog open={!!detailExercise} onOpenChange={(open) => !open && setDetailExercise(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailExercise?.name as string}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!!(detailExercise?.videoUrl) ? (
              <div className="w-full aspect-video rounded-md overflow-hidden bg-black/10">
                <UniversalVideoPlayer
                  url={detailExercise.videoUrl as string}
                  provider={detailExercise.videoProvider as string | undefined}
                />
              </div>
            ) : (
              <div className="w-full flex items-center justify-center rounded-md bg-muted h-20">
                <p className="text-sm text-muted-foreground">No video available for this exercise</p>
              </div>
            )}
            {!!(detailExercise?.description) && (
              <p className="text-sm text-muted-foreground">{detailExercise.description as string}</p>
            )}
            {!!(detailExercise?.musclesTargeted) && (detailExercise.musclesTargeted as string[]).length > 0 && (
              <div className="text-sm">
                <span className="font-medium">Muscles targeted: </span>
                <span className="text-muted-foreground">{(detailExercise.musclesTargeted as string[]).join(", ")}</span>
              </div>
            )}
            {!!(detailExercise?.commonMistakes) && (
              <div className="text-sm">
                <span className="font-medium">Common mistakes: </span>
                <span className="text-muted-foreground">{detailExercise.commonMistakes as string}</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
