"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  startSessionV2Action,
  updateSetLogV2Action,
  completeSessionV2Action,
} from "@/actions/session-v2-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Check, SkipForward, X, Play, Loader2, Timer, ChevronRight, ChevronLeft, Trophy } from "lucide-react";

// Types
type MediaItem = { id: string; url: string; type: string };
type BaseExercise = {
  id: string; name: string;
  imageUrl?: string | null; videoUrl?: string | null;
  bodyRegion?: string | null; instructions?: string | null;
  media: MediaItem[];
};
type SetLog = { id: string; setIndex: number; actualReps?: number | null; actualWeight?: number | null; actualDuration?: number | null };
type BlockExerciseSet = { id: string; orderIndex: number; targetReps?: number | null; targetDuration?: number | null; targetWeight?: number | null; restAfter?: number | null; targetDistance?: number | null };
type SessionExerciseLog = { id: string; blockExerciseId: string; status: string; setLogs: SetLog[] };
type BlockExercise = { id: string; exerciseId: string; notes?: string | null; exercise: BaseExercise; sets: BlockExerciseSet[] };
type WorkoutBlock = { id: string; exercises: BlockExercise[] };
type WorkoutSessionV2 = {
  id: string; status: string;
  workout: { id: string; name: string; blocks: WorkoutBlock[] };
  exerciseLogs: SessionExerciseLog[];
};

interface WorkoutSessionTrackerProps {
  session: WorkoutSessionV2;
}

export function WorkoutSessionTracker({ session }: WorkoutSessionTrackerProps) {
  const router = useRouter();

  const activeExercises = useMemo(
    () => session.workout.blocks.flatMap((b) => b.exercises),
    [session.workout.blocks]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => {
    const s = new Set<string>();
    session.exerciseLogs.forEach((l) => { if (l.status === "COMPLETED") s.add(l.blockExerciseId); });
    return s;
  });
  const [skippedIds, setSkippedIds] = useState<Set<string>>(() => {
    const s = new Set<string>();
    session.exerciseLogs.forEach((l) => { if (l.status === "SKIPPED") s.add(l.blockExerciseId); });
    return s;
  });

  const [sessionActive, setSessionActive] = useState(session.status !== "SCHEDULED");
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [rpe, setRpe] = useState(5);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(session.status === "IN_PROGRESS");
  const [activeSetLogs, setActiveSetLogs] = useState<Record<number, { actualReps?: number; actualWeight?: number; actualDuration?: number; completed: boolean }>>({});
  const [loggingSet, setLoggingSet] = useState<number | null>(null);

  const totalExercises = activeExercises.length;
  const doneCount = completedIds.size + skippedIds.size;
  const progress = totalExercises > 0 ? (doneCount / totalExercises) * 100 : 0;
  const currentExercise = activeExercises[currentIndex];

  useEffect(() => {
    if (!currentExercise) return;
    const initial: Record<number, { actualReps?: number; actualWeight?: number; actualDuration?: number; completed: boolean }> = {};
    const sessionLog = session.exerciseLogs.find((l) => l.blockExerciseId === currentExercise.id);
    currentExercise.sets.forEach((set, i) => {
      const existing = sessionLog?.setLogs.find((sl) => sl.setIndex === i);
      initial[i] = {
        actualReps: existing?.actualReps ?? set.targetReps ?? undefined,
        actualWeight: existing?.actualWeight ?? set.targetWeight ?? undefined,
        actualDuration: existing?.actualDuration ?? set.targetDuration ?? undefined,
        completed: !!existing || completedIds.has(currentExercise.id),
      };
    });
    setActiveSetLogs(initial);
  }, [currentExercise, session.exerciseLogs, completedIds]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerActive) interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => { if (interval) clearInterval(interval); };
  }, [timerActive]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const handleStart = async () => {
    setIsLoading(true);
    const result = await startSessionV2Action(session.id);
    if (result.success) { setSessionActive(true); setTimerActive(true); }
    else toast.error(result.error ?? "Failed to start session");
    setIsLoading(false);
  };

  const handleSetInputChange = (index: number, field: string, value: string) => {
    setActiveSetLogs((prev) => ({
      ...prev,
      [index]: { ...prev[index], [field]: value === "" ? undefined : Number(value) },
    }));
  };

  const handleLogSet = async (index: number) => {
    if (!currentExercise) return;
    setLoggingSet(index);
    const logData = activeSetLogs[index];
    try {
      await updateSetLogV2Action(session.id, currentExercise.id, index, {
        actualReps: logData.actualReps,
        actualWeight: logData.actualWeight,
        actualDuration: logData.actualDuration,
      });
      setActiveSetLogs((prev) => ({ ...prev, [index]: { ...prev[index], completed: true } }));
      const allDone = currentExercise.sets.every((_, i) => i === index || activeSetLogs[i]?.completed);
      if (allDone) {
        setCompletedIds((prev) => new Set(prev).add(currentExercise.id));
        setTimeout(advanceToNext, 600);
      }
    } catch {
      toast.error("Failed to log set");
    } finally {
      setLoggingSet(null);
    }
  };

  const handleComplete = async () => {
    if (!currentExercise) return;
    setIsLoading(true);
    try {
      for (let i = 0; i < currentExercise.sets.length; i++) {
        if (!activeSetLogs[i]?.completed) {
          await updateSetLogV2Action(session.id, currentExercise.id, i, activeSetLogs[i] || {});
        }
      }
      setCompletedIds((prev) => new Set(prev).add(currentExercise.id));
      advanceToNext();
    } catch {
      toast.error("Failed to save progress");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    if (!currentExercise) return;
    setSkippedIds((prev) => new Set(prev).add(currentExercise.id));
    advanceToNext();
  };

  const advanceToNext = () => {
    if (currentIndex < totalExercises - 1) setCurrentIndex((i) => i + 1);
    else { setShowEndDialog(true); setTimerActive(false); }
  };

  const handleEndSession = async () => {
    setIsLoading(true);
    const result = await completeSessionV2Action(session.id, rpe, notes);
    if (result.success) { toast.success("Workout completed! Great work!"); router.push("/dashboard"); }
    else toast.error(result.error ?? "Failed to complete session");
    setIsLoading(false);
  };

  // ── Pre-start screen ─────────────────────────────────────────────────────
  if (!sessionActive) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="overflow-hidden rounded-2xl border-0 shadow-xl ring-1 ring-border/50">
          {/* Hero */}
          <div className="bg-linear-to-br from-blue-600 via-indigo-600 to-violet-600 p-8 text-center text-white">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
              <Play className="h-8 w-8 fill-white text-white" />
            </div>
            <h2 className="text-2xl font-bold">{session.workout.name}</h2>
            <p className="mt-1 text-blue-200">
              {activeExercises.length} exercise{activeExercises.length !== 1 ? "s" : ""} · Let&apos;s go!
            </p>
          </div>
          {/* Exercise preview */}
          <div className="bg-card p-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Today&apos;s Exercises
            </p>
            <div className="space-y-2">
              {activeExercises.slice(0, 5).map((ex, i) => (
                <div key={ex.id} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="truncate text-sm font-medium">{ex.exercise.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {ex.sets.length} {ex.sets.length === 1 ? "set" : "sets"}
                  </span>
                </div>
              ))}
              {activeExercises.length > 5 && (
                <p className="text-center text-xs text-muted-foreground">
                  +{activeExercises.length - 5} more exercises
                </p>
              )}
            </div>
            <Button
              size="lg"
              className="mt-6 w-full bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-indigo-600"
              onClick={handleStart}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5 fill-current" />}
              Start Session
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Active workout ────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg space-y-4 pb-24">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Timer className="h-4 w-4 text-primary" />
          {formatTime(timer)}
        </div>
        <Badge variant="outline" className="font-semibold">
          {doneCount} / {totalExercises}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => { toast.info("Session preserved"); router.push("/dashboard"); }}
        >
          <X className="h-3.5 w-3.5" />
          End
        </Button>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <Progress value={progress} className="h-2 rounded-full" />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{Math.round(progress)}% complete</span>
          <span>{totalExercises - doneCount} remaining</span>
        </div>
      </div>

      {/* Exercise navigation pills */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <span className="text-sm font-semibold text-muted-foreground">
          Exercise {currentIndex + 1} of {totalExercises}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs"
          disabled={currentIndex === totalExercises - 1}
          onClick={() => setCurrentIndex((i) => Math.min(totalExercises - 1, i + 1))}
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Current exercise card */}
      {currentExercise && (
        <Card className="overflow-hidden border-0 shadow-md ring-1 ring-border/50">
          {/* Status stripe */}
          <div className={`h-1 w-full ${completedIds.has(currentExercise.id) ? "bg-emerald-500" : skippedIds.has(currentExercise.id) ? "bg-muted" : "bg-primary"}`} />

          <CardContent className="p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-xl font-bold leading-tight">{currentExercise.exercise.name}</h3>
              {completedIds.has(currentExercise.id) && (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border shrink-0">
                  <Check className="mr-1 h-3 w-3" /> Done
                </Badge>
              )}
              {skippedIds.has(currentExercise.id) && (
                <Badge className="bg-muted text-muted-foreground border shrink-0">
                  Skipped
                </Badge>
              )}
            </div>

            {/* Image */}
            <ExerciseImageLightbox
              src={currentExercise.exercise.imageUrl ?? undefined}
              videoUrl={currentExercise.exercise.videoUrl ?? undefined}
              alt={currentExercise.exercise.name}
              bodyRegion={currentExercise.exercise.bodyRegion ?? ""}
              label={currentExercise.exercise.name.split(" ").slice(0, 2).join(" ")}
              thumbnailClassName="relative h-52 w-full overflow-hidden rounded-xl"
            />

            {/* Instructions */}
            {currentExercise.exercise.instructions && (
              <div className="rounded-xl bg-muted/40 px-4 py-3">
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {currentExercise.exercise.instructions}
                </p>
              </div>
            )}

            {/* Notes from clinician */}
            {currentExercise.notes && (
              <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <span className="mt-0.5 text-xs font-bold uppercase tracking-widest text-blue-500">Note</span>
                <p className="text-sm italic text-blue-700">{currentExercise.notes}</p>
              </div>
            )}

            {/* Sets */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Sets
              </p>
              {currentExercise.sets.map((set, i) => {
                const logData = activeSetLogs[i] || {};
                const isCompleted = logData.completed;
                const isLoggingThis = loggingSet === i;

                return (
                  <div
                    key={set.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${isCompleted ? "border-emerald-200 bg-emerald-50/50" : "border-border bg-background"}`}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${isCompleted ? "bg-emerald-500 text-white" : "bg-primary/10 text-primary"}`}>
                      {isCompleted ? <Check className="h-4 w-4" /> : i + 1}
                    </div>

                    <div className="flex flex-1 flex-wrap gap-2">
                      {set.targetReps != null && (
                        <div className="space-y-0.5">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Reps</Label>
                          <Input
                            type="number"
                            placeholder={set.targetReps.toString()}
                            value={logData.actualReps ?? ""}
                            onChange={(e) => handleSetInputChange(i, "actualReps", e.target.value)}
                            className="h-8 w-20 text-sm"
                            disabled={isCompleted}
                          />
                        </div>
                      )}
                      {set.targetWeight != null && (
                        <div className="space-y-0.5">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Weight</Label>
                          <Input
                            type="number"
                            placeholder={set.targetWeight.toString()}
                            value={logData.actualWeight ?? ""}
                            onChange={(e) => handleSetInputChange(i, "actualWeight", e.target.value)}
                            className="h-8 w-20 text-sm"
                            disabled={isCompleted}
                          />
                        </div>
                      )}
                      {set.targetDuration != null && (
                        <div className="space-y-0.5">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Secs</Label>
                          <Input
                            type="number"
                            placeholder={set.targetDuration.toString()}
                            value={logData.actualDuration ?? ""}
                            onChange={(e) => handleSetInputChange(i, "actualDuration", e.target.value)}
                            className="h-8 w-20 text-sm"
                            disabled={isCompleted}
                          />
                        </div>
                      )}
                    </div>

                    <Button
                      size="icon"
                      variant={isCompleted ? "secondary" : "default"}
                      className="h-8 w-8 shrink-0 rounded-full"
                      onClick={() => handleLogSet(i)}
                      disabled={isCompleted || isLoggingThis}
                    >
                      {isLoggingThis ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Video */}
            {(currentExercise.exercise.videoUrl || currentExercise.exercise.media.length > 0) && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Tutorial Video</p>
                <ExerciseVideoPlayer
                  videoUrl={currentExercise.exercise.videoUrl ?? undefined}
                  mediaItems={currentExercise.exercise.media.map((m) => ({ id: m.id, url: m.url, mediaType: m.type }))}
                />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <Button
                className="flex-1 bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-600"
                onClick={handleComplete}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Complete
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={handleSkip}
                disabled={isLoading}
              >
                <SkipForward className="h-4 w-4" />
                Skip
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* End session dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25">
              <Trophy className="h-8 w-8 text-white" />
            </div>
            <DialogTitle className="text-center text-xl">Great work!</DialogTitle>
            <p className="text-center text-sm text-muted-foreground">
              You completed {completedIds.size} of {totalExercises} exercises in {formatTime(timer)}.
            </p>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div>
              <Label className="font-semibold">
                How hard was this session? <span className="font-normal text-muted-foreground">RPE {rpe}/10</span>
              </Label>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Easy</span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={rpe}
                  onChange={(e) => setRpe(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="text-xs text-muted-foreground">Max</span>
              </div>
              {/* RPE colour indicator */}
              <div className="mt-2 flex gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${i < rpe ? i < 4 ? "bg-emerald-500" : i < 7 ? "bg-amber-500" : "bg-red-500" : "bg-muted"}`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-semibold">Session Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea
                placeholder="How did it feel? Any pain or discomfort to flag?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { toast.info("Session preserved"); router.push("/dashboard"); }}
            >
              Skip &amp; Exit
            </Button>
            <Button
              className="flex-1 bg-linear-to-r from-emerald-500 to-teal-500 border-0 text-white hover:from-emerald-600 hover:to-teal-600"
              onClick={handleEndSession}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Complete Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
