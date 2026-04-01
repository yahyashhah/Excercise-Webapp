"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  startSessionAction as startWorkoutSession,
  completeSessionExerciseAction as completeSessionExercise,
  completeSessionAction as completeWorkoutSession,
  abandonSessionAction as abandonWorkoutSession,
} from "@/actions/adherence-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ExerciseImageLightbox } from "@/components/exercises/exercise-image-lightbox";
import { ExerciseVideoPlayer } from "@/components/exercises/exercise-video-player";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Check, SkipForward, X, Play, Loader2, Timer, Dumbbell, Clock,
  ChevronLeft, ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { ROUTES } from "@/lib/utils/constants";
import type { PlanExercise, Exercise, ExerciseMedia, WorkoutPlan } from "@prisma/client";

interface WorkoutSessionTrackerProps {
  plan: WorkoutPlan & {
    exercises: Array<PlanExercise & { exercise: Exercise & { media: ExerciseMedia[] } }>;
  };
}

export function WorkoutSessionTracker({ plan }: WorkoutSessionTrackerProps) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [painLevel, setPainLevel] = useState(0);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  const activeExercises = plan.exercises
    .filter((e) => e.isActive)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const totalExercises = activeExercises.length;
  const doneCount = completedIds.size + skippedIds.size;
  const progress = totalExercises > 0 ? (doneCount / totalExercises) * 100 : 0;
  const currentExercise = activeExercises[currentIndex];

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerActive) {
      interval = setInterval(() => setTimer((t) => t + 1), 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [timerActive]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStart = async () => {
    setIsLoading(true);
    const result = await startWorkoutSession(plan.id);
    if (result.success && result.data) {
      setSessionId(result.data.id);
      setTimerActive(true);
    } else {
      toast.error(result.error ?? "Failed to start session");
    }
    setIsLoading(false);
  };

  const handleComplete = async () => {
    if (!sessionId || !currentExercise) return;
    await completeSessionExercise(sessionId, currentExercise.id, {
      status: "completed",
      actualSets: currentExercise.sets,
      actualReps: currentExercise.reps ?? undefined,
    });
    setCompletedIds((prev) => new Set(prev).add(currentExercise.id));
    advanceToNext();
  };

  const handleSkip = async () => {
    if (!sessionId || !currentExercise) return;
    await completeSessionExercise(sessionId, currentExercise.id, { status: "skipped" });
    setSkippedIds((prev) => new Set(prev).add(currentExercise.id));
    advanceToNext();
  };

  const advanceToNext = () => {
    if (currentIndex < totalExercises - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowEndDialog(true);
    }
  };

  const handleEndSession = async () => {
    if (!sessionId) return;
    setIsLoading(true);
    const result = await completeWorkoutSession(sessionId, {
      overallPainLevel: painLevel,
      notes: notes || undefined,
    });
    if (result.success) {
      toast.success("Workout completed! Great job 🎉");
      router.push(ROUTES.WORKOUT_PLAN_DETAIL(plan.id));
    } else {
      toast.error(result.error ?? "Failed to complete session");
    }
    setIsLoading(false);
  };

  const handleAbandon = async () => {
    if (!sessionId) return;
    await abandonWorkoutSession(sessionId);
    toast.info("Session ended");
    router.push(ROUTES.WORKOUT_PLAN_DETAIL(plan.id));
  };

  // ── Pre-start screen ──────────────────────────────────────────────────────
  if (!sessionId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
              <Dumbbell className="h-10 w-10 text-white" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold">{plan.title}</h2>
            <p className="mt-2 text-muted-foreground">
              {activeExercises.length} exercise{activeExercises.length !== 1 ? "s" : ""} ready to go
            </p>
          </div>
          {/* Exercise preview */}
          <div className="rounded-xl border border-border/60 bg-card p-4 text-left space-y-2">
            {activeExercises.slice(0, 4).map((ex, i) => (
              <div key={ex.id} className="flex items-center gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="font-medium">{ex.exercise.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {ex.sets} × {ex.reps ? `${ex.reps} reps` : ex.durationSeconds ? `${ex.durationSeconds}s` : ""}
                </span>
              </div>
            ))}
            {activeExercises.length > 4 && (
              <p className="text-xs text-muted-foreground pt-1">
                +{activeExercises.length - 4} more exercises
              </p>
            )}
          </div>
          <Button
            size="lg"
            className="w-full h-12 text-base bg-linear-to-r from-blue-500 to-indigo-500 border-0 hover:from-blue-600 hover:to-indigo-600 shadow-md shadow-blue-500/20"
            onClick={handleStart}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Play className="mr-2 h-5 w-5 fill-white" />
            )}
            Start Session
          </Button>
        </div>
      </div>
    );
  }

  // ── Active session ────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Session bar */}
      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card p-3">
        <div className="flex items-center gap-2 text-sm font-semibold tabular-nums">
          <Timer className="h-4 w-4 text-primary" />
          {formatTime(timer)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {doneCount} / {totalExercises}
          </span>
          <div className="w-20">
            <Progress value={progress} className="h-2" />
          </div>
          <span className="text-xs font-semibold text-primary">{Math.round(progress)}%</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleAbandon}
        >
          <X className="h-3.5 w-3.5" />
          End
        </Button>
      </div>

      {/* Exercise card */}
      {currentExercise && (
        <Card className="border-border/60 overflow-hidden">
          {/* Top accent */}
          <div className="h-1 w-full bg-linear-to-r from-blue-500 to-indigo-500" />

          <CardContent className="p-0">
            {/* Exercise counter + nav */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <Badge variant="outline" className="text-xs">
                Exercise {currentIndex + 1} of {totalExercises}
              </Badge>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={currentIndex === totalExercises - 1}
                  onClick={() => setCurrentIndex((i) => Math.min(totalExercises - 1, i + 1))}
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Exercise name */}
            <div className="px-5 pb-4">
              <h3 className="text-xl font-bold text-foreground">
                {currentExercise.exercise.name}
              </h3>
              {completedIds.has(currentExercise.id) && (
                <Badge className="mt-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 border text-xs">
                  ✓ Completed
                </Badge>
              )}
              {skippedIds.has(currentExercise.id) && (
                <Badge variant="outline" className="mt-1.5 text-xs text-muted-foreground">
                  Skipped
                </Badge>
              )}
            </div>

            {/* Image/Video */}
            <div className="px-5">
              <ExerciseImageLightbox
                src={currentExercise.exercise.imageUrl}
                videoUrl={currentExercise.exercise.videoUrl}
                alt={currentExercise.exercise.name}
                bodyRegion={currentExercise.exercise.bodyRegion}
                label={currentExercise.exercise.name.split(" ").slice(0, 2).join(" ")}
                thumbnailClassName="relative h-52 w-full overflow-hidden rounded-xl"
              />
            </div>

            {/* Stats pills */}
            <div className="flex gap-2 px-5 pt-4 flex-wrap">
              <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2">
                <Dumbbell className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold">{currentExercise.sets}</span>
                <span className="text-xs text-muted-foreground">sets</span>
              </div>
              {currentExercise.reps && (
                <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2">
                  <span className="text-sm font-bold">{currentExercise.reps}</span>
                  <span className="text-xs text-muted-foreground">reps</span>
                </div>
              )}
              {currentExercise.durationSeconds && (
                <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-sm font-bold">{currentExercise.durationSeconds}s</span>
                  <span className="text-xs text-muted-foreground">hold</span>
                </div>
              )}
              {currentExercise.restSeconds && (
                <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-bold">{currentExercise.restSeconds}s</span>
                  <span className="text-xs text-muted-foreground">rest</span>
                </div>
              )}
            </div>

            {/* Instructions */}
            {currentExercise.exercise.instructions && (
              <div className="mx-5 mt-4 rounded-xl bg-muted/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Instructions
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {currentExercise.exercise.instructions}
                </p>
              </div>
            )}

            {/* Clinician notes */}
            {currentExercise.notes && (
              <div className="mx-5 mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-600 mb-1">Note from your clinician</p>
                <p className="text-sm text-blue-800 italic">{currentExercise.notes}</p>
              </div>
            )}

            {/* Video */}
            {(currentExercise.exercise.videoUrl || currentExercise.exercise.media.length > 0) && (
              <div className="px-5 mt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Video Tutorial
                </p>
                <ExerciseVideoPlayer
                  videoUrl={currentExercise.exercise.videoUrl}
                  mediaItems={currentExercise.exercise.media}
                />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 p-5 pt-4">
              <Button
                className="flex-1 h-11 bg-linear-to-r from-blue-500 to-indigo-500 border-0 hover:from-blue-600 hover:to-indigo-600 font-semibold"
                onClick={handleComplete}
                disabled={completedIds.has(currentExercise.id)}
              >
                <Check className="mr-2 h-4 w-4" />
                Done
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-11 border-border/60"
                onClick={handleSkip}
                disabled={skippedIds.has(currentExercise.id)}
              >
                <SkipForward className="mr-2 h-4 w-4" />
                Skip
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Exercise progress dots */}
      <div className="flex justify-center gap-1.5 py-1 flex-wrap">
        {activeExercises.map((ex, i) => (
          <button
            key={ex.id}
            onClick={() => setCurrentIndex(i)}
            className={`h-2 rounded-full transition-all ${
              i === currentIndex
                ? "w-6 bg-primary"
                : completedIds.has(ex.id)
                  ? "w-2 bg-emerald-500"
                  : skippedIds.has(ex.id)
                    ? "w-2 bg-muted-foreground/40"
                    : "w-2 bg-muted-foreground/20"
            }`}
            aria-label={`Exercise ${i + 1}`}
          />
        ))}
      </div>

      {/* Session complete dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Great work! 🎉</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              You completed {completedIds.size} of {totalExercises} exercises.
              How did it feel overall?
            </p>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Pain level */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Overall Pain Level</Label>
                <span className="text-sm font-bold tabular-nums text-primary">{painLevel} / 10</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                value={painLevel}
                onChange={(e) => setPainLevel(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>No pain</span>
                <span>Severe</span>
              </div>
              {/* Visual indicator */}
              <div className="flex gap-1 mt-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i < painLevel
                        ? i < 3 ? "bg-emerald-400" : i < 6 ? "bg-amber-400" : "bg-red-500"
                        : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-sm font-semibold mb-1.5 block">Notes (optional)</Label>
              <Textarea
                placeholder="How did the workout feel? Any exercises too difficult or too easy?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowEndDialog(false)} disabled={isLoading}>
              Keep Going
            </Button>
            <Button
              className="bg-linear-to-r from-blue-500 to-indigo-500 border-0 hover:from-blue-600 hover:to-indigo-600"
              onClick={handleEndSession}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Complete Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
