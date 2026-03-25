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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Check, SkipForward, X, Play, Loader2 } from "lucide-react";
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
    return () => {
      if (interval) clearInterval(interval);
    };
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

    await completeSessionExercise(sessionId, currentExercise.id, {
      status: "skipped",
    });

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
      toast.success("Workout completed!");
      router.push(ROUTES.WORKOUT_PLAN_DETAIL(plan.id));
    } else {
      toast.error(result.error ?? "Failed to complete session");
    }
    setIsLoading(false);
  };

  const handleAbandon = async () => {
    if (!sessionId) return;
    await abandonWorkoutSession(sessionId);
    toast.info("Session abandoned");
    router.push(ROUTES.WORKOUT_PLAN_DETAIL(plan.id));
  };

  if (!sessionId) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader className="text-center">
          <CardTitle>Ready to Work Out?</CardTitle>
          <p className="text-muted-foreground">
            {plan.title} - {activeExercises.length} exercises
          </p>
        </CardHeader>
        <CardContent className="text-center">
          <Button size="lg" onClick={handleStart} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Play className="mr-2 h-5 w-5" />
            )}
            Start Session
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">{formatTime(timer)}</div>
        <Badge variant="outline">
          {doneCount} / {totalExercises} exercises
        </Badge>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={handleAbandon}>
          <X className="mr-1 h-4 w-4" />
          End
        </Button>
      </div>

      <Progress value={progress} className="h-2" />

      {currentExercise && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Badge variant="outline">
                Exercise {currentIndex + 1} of {totalExercises}
              </Badge>
            </div>
            <CardTitle className="text-xl mt-2">
              {currentExercise.exercise.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ExerciseImageLightbox
              src={currentExercise.exercise.imageUrl}
              videoUrl={currentExercise.exercise.videoUrl}
              alt={currentExercise.exercise.name}
              bodyRegion={currentExercise.exercise.bodyRegion}
              label={currentExercise.exercise.name.split(" ").slice(0, 2).join(" ")}
              thumbnailClassName="relative h-52 w-full overflow-hidden rounded-lg"
            />

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-muted rounded">
                <p className="text-2xl font-bold">{currentExercise.sets}</p>
                <p className="text-xs text-muted-foreground">Sets</p>
              </div>
              {currentExercise.reps && (
                <div className="p-2 bg-muted rounded">
                  <p className="text-2xl font-bold">{currentExercise.reps}</p>
                  <p className="text-xs text-muted-foreground">Reps</p>
                </div>
              )}
              {currentExercise.durationSeconds && (
                <div className="p-2 bg-muted rounded">
                  <p className="text-2xl font-bold">{currentExercise.durationSeconds}s</p>
                  <p className="text-xs text-muted-foreground">Hold</p>
                </div>
              )}
              {currentExercise.restSeconds && (
                <div className="p-2 bg-muted rounded">
                  <p className="text-2xl font-bold">{currentExercise.restSeconds}s</p>
                  <p className="text-xs text-muted-foreground">Rest</p>
                </div>
              )}
            </div>

            {currentExercise.exercise.instructions && (
              <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                {currentExercise.exercise.instructions}
              </div>
            )}

            {currentExercise.notes && (
              <p className="text-sm italic text-muted-foreground">
                Note: {currentExercise.notes}
              </p>
            )}

            {(currentExercise.exercise.videoUrl || currentExercise.exercise.media.length > 0) && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tutorial
                </p>
                <ExerciseVideoPlayer
                  videoUrl={currentExercise.exercise.videoUrl}
                  mediaItems={currentExercise.exercise.media}
                />
              </div>
            )}

            <div className="flex gap-3">
              <Button className="flex-1" onClick={handleComplete}>
                <Check className="mr-2 h-4 w-4" />
                Complete
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleSkip}>
                <SkipForward className="mr-2 h-4 w-4" />
                Skip
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Great work! How did it go?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Overall Pain Level: {painLevel}/10</Label>
              <Input
                type="range"
                min={0}
                max={10}
                value={painLevel}
                onChange={(e) => setPainLevel(Number(e.target.value))}
                className="mt-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>No pain</span>
                <span>Severe pain</span>
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="How did the workout feel?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleEndSession} disabled={isLoading}>
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
