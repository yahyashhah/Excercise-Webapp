"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  startSessionV2Action,
  updateSetLogV2Action,
  completeSessionV2Action,
} from "@/actions/session-v2-actions";
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

// Types derived from V2 schema
type MediaItem = {
  id: string;
  url: string;
  type: string;
};

type BaseExercise = {
  id: string;
  name: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  bodyRegion?: string | null;
  instructions?: string | null;
  media: MediaItem[];
};

type SetLog = {
  id: string;
  setIndex: number;
  actualReps?: number | null;
  actualWeight?: number | null;
  actualDuration?: number | null;
};

type BlockExerciseSet = {
  id: string;
  orderIndex: number;
  targetReps?: number | null;
  targetDuration?: number | null;
  targetWeight?: number | null;
  restAfter?: number | null;
  targetDistance?: number | null;
};

type SessionExerciseLog = {
  id: string;
  blockExerciseId: string;
  status: string;
  setLogs: SetLog[];
};

type BlockExercise = {
  id: string;
  exerciseId: string;
  notes?: string | null;
  exercise: BaseExercise;
  sets: BlockExerciseSet[];
};

type WorkoutBlock = {
  id: string;
  exercises: BlockExercise[];
};

type WorkoutSessionV2 = {
  id: string;
  status: string;
  workout: {
    id: string;
    name: string;
    blocks: WorkoutBlock[];
  };
  exerciseLogs: SessionExerciseLog[];
};

interface WorkoutSessionTrackerProps {
  session: WorkoutSessionV2;
}

export function WorkoutSessionTracker({ session }: WorkoutSessionTrackerProps) {
  const router = useRouter();
  
  // Flatten active exercises from all blocks
  const activeExercises = useMemo(() => {
    return session.workout.blocks.flatMap(block => block.exercises);
  }, [session.workout.blocks]);

  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Initialize completed/skipped from DB log
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => {
    const completed = new Set<string>();
    session.exerciseLogs.forEach(log => {
      if (log.status === "COMPLETED") completed.add(log.blockExerciseId);
    });
    return completed;
  });
  
  const [skippedIds, setSkippedIds] = useState<Set<string>>(() => {
    const skipped = new Set<string>();
    session.exerciseLogs.forEach(log => {
      if (log.status === "SKIPPED") skipped.add(log.blockExerciseId);
    });
    return skipped;
  });

  const [sessionActive, setSessionActive] = useState(session.status !== "SCHEDULED");
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [painLevel, setPainLevel] = useState(0);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(session.status === "IN_PROGRESS");

  const totalExercises = activeExercises.length;
  const doneCount = completedIds.size + skippedIds.size;
  const progress = totalExercises > 0 ? (doneCount / totalExercises) * 100 : 0;
  const currentExercise = activeExercises[currentIndex];

  const [activeSetLogs, setActiveSetLogs] = useState<Record<number, {
    actualReps?: number;
    actualWeight?: number;
    actualDuration?: number;
    completed: boolean;
  }>>({});
  const [loggingSet, setLoggingSet] = useState<number | null>(null);

  useEffect(() => {
    if (currentExercise) {
      const initial: Record<number, any> = {};
      const sessionLog = session.exerciseLogs.find(
        (log) => log.blockExerciseId === currentExercise.id
      );
      
      currentExercise.sets.forEach((set, i) => {
        const existingLog = sessionLog?.setLogs.find((sl) => sl.setIndex === i);
        initial[i] = {
          actualReps: existingLog?.actualReps ?? set.targetReps ?? undefined,
          actualWeight: existingLog?.actualWeight ?? set.targetWeight ?? undefined,
          actualDuration: existingLog?.actualDuration ?? set.targetDuration ?? undefined,
          completed: !!existingLog || completedIds.has(currentExercise.id),
        };
      });
      setActiveSetLogs(initial);
    }
  }, [currentExercise, session.exerciseLogs, completedIds]);

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
    const result = await startSessionV2Action(session.id);
    if (result.success) {
      setSessionActive(true);
      setTimerActive(true);
    } else {
      toast.error(result.error ?? "Failed to start session");
    }
    setIsLoading(false);
  };

  const handleSetInputChange = (index: number, field: string, value: string) => {
    const numValue = value === "" ? undefined : Number(value);
    setActiveSetLogs((prev) => ({
      ...prev,
      [index]: {
        ...prev[index],
        [field]: numValue
      }
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
      setActiveSetLogs(prev => ({
        ...prev,
        [index]: { ...prev[index], completed: true }
      }));

      let isLast = true;
      for (let i = 0; i < currentExercise.sets.length; i++) {
         if (i !== index && !activeSetLogs[i]?.completed) {
            isLast = false;
            break;
         }
      }

      if (isLast) {
         setCompletedIds((prev) => new Set(prev).add(currentExercise.id));
         setTimeout(() => {
           advanceToNext();
         }, 500);
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
      // Auto-log any sets that are not completed yet
      for (let i = 0; i < currentExercise.sets.length; i++) {
        if (!activeSetLogs[i]?.completed) {
          const logData = activeSetLogs[i] || {};
          await updateSetLogV2Action(session.id, currentExercise.id, i, {
            actualReps: logData.actualReps,
            actualDuration: logData.actualDuration,
            actualWeight: logData.actualWeight,
          });
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

  const handleSkip = async () => {
    if (!currentExercise) return;

    setSkippedIds((prev) => new Set(prev).add(currentExercise.id));
    advanceToNext();
  };

  const advanceToNext = () => {
    if (currentIndex < totalExercises - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowEndDialog(true);
      setTimerActive(false);
    }
  };

  const handleEndSession = async () => {
    setIsLoading(true);

    const result = await completeSessionV2Action(session.id, painLevel, notes);

    if (result.success) {
      toast.success("Workout completed!");
      // Send to patient dashboard instead of nonexistent CONSTANTS
      router.push("/dashboard");
    } else {
      toast.error(result.error ?? "Failed to complete session");
    }
    setIsLoading(false);
  };

  const handleAbandon = async () => {
    toast.info("Session preserved but ended");
    router.push("/dashboard");
  };

  if (!sessionActive) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader className="text-center">
          <CardTitle>Ready to Work Out?</CardTitle>
          <p className="text-muted-foreground">
            {session.workout.name} - {activeExercises.length} exercises
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

  // Find out how many sets total vs completed? For UI we just show how many sets there are
  const currentSetsCount = currentExercise?.sets?.length || 1;
  const firstSet = currentExercise?.sets?.[0]; // Show baseline rep/duration from first set

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-24">
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
              src={currentExercise.exercise.imageUrl ?? undefined}
              videoUrl={currentExercise.exercise.videoUrl ?? undefined}
              alt={currentExercise.exercise.name}
              bodyRegion={currentExercise.exercise.bodyRegion ?? ""}
              label={currentExercise.exercise.name.split(" ").slice(0, 2).join(" ")}
              thumbnailClassName="relative h-52 w-full overflow-hidden rounded-lg"
            />

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

            <div className="space-y-3 py-2">
              {currentExercise.sets.map((set, i) => {
                const logData = activeSetLogs[i] || {};
                const isCompleted = logData.completed;
                const isLogging = loggingSet === i;
                
                return (
                  <div key={set.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${isCompleted ? 'bg-muted/50 border-muted' : 'bg-background border-border'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isCompleted ? 'bg-muted-foreground/20 text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                      {i + 1}
                    </div>
                    
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {set.targetReps != null && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-muted-foreground font-semibold">Reps</Label>
                          <Input
                            type="number"
                            placeholder={set.targetReps.toString()}
                            value={logData.actualReps ?? ""}
                            onChange={(e) => handleSetInputChange(i, "actualReps", e.target.value)}
                            className="h-8 text-sm"
                            disabled={isCompleted}
                          />
                        </div>
                      )}
                      {set.targetWeight != null && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-muted-foreground font-semibold">Lbs/Kg</Label>
                          <Input
                            type="number"
                            placeholder={set.targetWeight.toString()}
                            value={logData.actualWeight ?? ""}
                            onChange={(e) => handleSetInputChange(i, "actualWeight", e.target.value)}
                            className="h-8 text-sm"
                            disabled={isCompleted}
                          />
                        </div>
                      )}
                      {set.targetDuration != null && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-muted-foreground font-semibold">Secs</Label>
                          <Input
                            type="number"
                            placeholder={set.targetDuration.toString()}
                            value={logData.actualDuration ?? ""}
                            onChange={(e) => handleSetInputChange(i, "actualDuration", e.target.value)}
                            className="h-8 text-sm"
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
                      disabled={isCompleted || isLogging}
                    >
                      {isLogging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                  </div>
                );
              })}
            </div>

            {(currentExercise.exercise.videoUrl || currentExercise.exercise.media.length > 0) && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tutorial
                </p>
                <ExerciseVideoPlayer
                  videoUrl={currentExercise.exercise.videoUrl ?? undefined}
                  mediaItems={currentExercise.exercise.media as any}
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
              <Label>Overall RPE (Difficulty): {painLevel}/10</Label>
              <Input
                type="range"
                min={0}
                max={10}
                value={painLevel}
                onChange={(e) => setPainLevel(Number(e.target.value))}
                className="mt-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Very Easy</span>
                <span>Max Effort</span>
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

