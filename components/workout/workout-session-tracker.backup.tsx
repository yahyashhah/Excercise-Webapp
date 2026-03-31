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
import { submitFeedbackAction } from "@/actions/feedback-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ExerciseVideoPlayer } from "@/components/exercises/exercise-video-player";
import {
  Check,
  X,
  Play,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Video,
  ArrowRight,
} from "lucide-react";
import { ROUTES } from "@/lib/utils/constants";
import type {
  PlanExercise,
  Exercise,
  ExerciseMedia,
  WorkoutPlan,
} from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkoutScreen = "overview" | "workout";
type FeelingChoice = "completed" | "discomfort" | "pain" | "too-easy" | null;

type PlanExerciseWithExercise = PlanExercise & {
  exercise: Exercise & { media: ExerciseMedia[] };
};

interface WorkoutSessionTrackerProps {
  plan: WorkoutPlan & { exercises: PlanExerciseWithExercise[] };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASE_ORDER = [
  "WARMUP",
  "ACTIVATION",
  "STRENGTHENING",
  "MOBILITY",
  "COOLDOWN",
];
const PHASE_LABELS: Record<string, string> = {
  WARMUP: "Warm-Up",
  ACTIVATION: "Activation",
  STRENGTHENING: "Strengthening",
  MOBILITY: "Mobility",
  COOLDOWN: "Cool-Down",
};
const PHASE_COLORS: Record<string, string> = {
  WARMUP: "bg-orange-100 text-orange-700",
  ACTIVATION: "bg-yellow-100 text-yellow-700",
  STRENGTHENING: "bg-blue-100 text-blue-700",
  MOBILITY: "bg-purple-100 text-purple-700",
  COOLDOWN: "bg-teal-100 text-teal-700",
};

function formatPrescription(pe: PlanExercise): string {
  if (pe.reps) return `${pe.sets}×${pe.reps}`;
  if (pe.durationSeconds) return `${pe.sets}×${pe.durationSeconds}s`;
  return `${pe.sets} sets`;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// ─── Video Popup ──────────────────────────────────────────────────────────────

function VideoPopupButton({
  videoUrl,
  mediaItems,
  exerciseName,
}: {
  videoUrl?: string | null;
  mediaItems: ExerciseMedia[];
  exerciseName: string;
}) {
  const [open, setOpen] = useState(false);
  const hasVideo =
    !!videoUrl || mediaItems.some((m) => m.mediaType?.toLowerCase() === "video");
  if (!hasVideo) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors shrink-0"
      >
        <Video className="h-3 w-3" />
        Video
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl p-4">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold truncate pr-6">
              {exerciseName}
            </DialogTitle>
          </DialogHeader>
          <ExerciseVideoPlayer
            videoUrl={videoUrl}
            mediaItems={mediaItems}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Overview (Quick View Dashboard) ─────────────────────────────────────────

function OverviewScreen({
  plan,
  onStart,
  isLoading,
}: {
  plan: WorkoutSessionTrackerProps["plan"];
  onStart: () => void;
  isLoading: boolean;
}) {
  const activeExercises = plan.exercises
    .filter((e) => e.isActive)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  // Group by day
  const byDay = new Map<number, PlanExerciseWithExercise[]>();
  for (const pe of activeExercises) {
    const day = pe.dayOfWeek ?? 0;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(pe);
  }
  const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-5 max-w-xl mx-auto pb-6">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-900">{plan.title}</h1>
        {plan.description && (
          <p className="text-sm text-slate-500 mt-1">{plan.description}</p>
        )}
        <p className="text-xs text-slate-400 mt-1">
          {activeExercises.length} exercise
          {activeExercises.length !== 1 ? "s" : ""} · tap a video to preview
        </p>
      </div>

      {/* Day sections */}
      {sortedDays.map((day) => {
        const dayExercises = byDay.get(day)!;

        // Group within day by phase
        const byPhase = new Map<string, PlanExerciseWithExercise[]>();
        for (const pe of dayExercises) {
          const phase = pe.exercise.exercisePhase ?? "STRENGTHENING";
          if (!byPhase.has(phase)) byPhase.set(phase, []);
          byPhase.get(phase)!.push(pe);
        }
        const sortedPhases = Array.from(byPhase.keys()).sort(
          (a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b)
        );

        return (
          <div
            key={day}
            className="rounded-xl border border-slate-200 overflow-hidden"
          >
            {/* Day header */}
            <div className="flex items-center gap-2 bg-slate-50 border-b border-slate-200 px-4 py-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shrink-0">
                {day === 0 ? "·" : day}
              </span>
              <span className="font-semibold text-slate-800 text-sm">
                {day === 0 ? "Exercises" : `Day ${day}`}
              </span>
              <span className="text-xs text-slate-400">
                ({dayExercises.length})
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {sortedPhases.map((phase) => {
                const phaseExercises = byPhase.get(phase)!;
                const colorClass =
                  PHASE_COLORS[phase] ?? "bg-slate-100 text-slate-700";

                return (
                  <div key={phase} className="px-3 py-2.5 space-y-1.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${colorClass}`}
                    >
                      {PHASE_LABELS[phase] ?? phase}
                    </span>

                    {phaseExercises.map((pe) => (
                      <div
                        key={pe.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-slate-800 truncate">
                            {pe.exercise.name}
                          </span>
                          <span className="text-xs text-slate-400 shrink-0">
                            {formatPrescription(pe)}
                          </span>
                        </div>
                        <VideoPopupButton
                          videoUrl={pe.exercise.videoUrl}
                          mediaItems={pe.exercise.media}
                          exerciseName={pe.exercise.name}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Start button */}
      <Button
        size="lg"
        className="w-full"
        onClick={onStart}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : (
          <Play className="mr-2 h-5 w-5" />
        )}
        Start Workout
      </Button>
    </div>
  );
}

// ─── Per-exercise feedback panel ──────────────────────────────────────────────

function FeedbackPanel({
  onAction,
  onSkip,
  submitting,
}: {
  onAction: (feeling: Exclude<FeelingChoice, null>, note: string) => Promise<void>;
  onSkip: () => Promise<void>;
  submitting: boolean;
}) {
  const [choice, setChoice] = useState<FeelingChoice>(null);
  const [note, setNote] = useState("");
  const [localSubmitting, setLocalSubmitting] = useState(false);

  const busy = submitting || localSubmitting;

  const handleChoiceClick = async (feeling: Exclude<FeelingChoice, null>) => {
    if (feeling === "completed") {
      setLocalSubmitting(true);
      await onAction("completed", "");
      setLocalSubmitting(false);
      return;
    }
    setChoice(feeling);
  };

  const handleSubmit = async () => {
    if (!choice) return;
    setLocalSubmitting(true);
    await onAction(choice, note);
    setLocalSubmitting(false);
  };

  if (choice) {
    return (
      <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
        {/* Adaptive hint */}
        {choice === "pain" && (
          <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            <p className="font-semibold mb-1">Modification Suggestion</p>
            <p>
              Reduce your range of motion or the number of sets. Stop if pain
              worsens. Your clinician will be notified.
            </p>
          </div>
        )}
        {choice === "discomfort" && (
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-700">
            <p className="font-semibold mb-1">Good to Know</p>
            <p>
              Mild discomfort during rehab can be normal. Reduce intensity if it
              persists. Your clinician will see this note.
            </p>
          </div>
        )}
        {choice === "too-easy" && (
          <div className="rounded-lg border border-purple-100 bg-purple-50 p-3 text-sm text-purple-700">
            <p className="font-semibold mb-1">Progression Suggestion</p>
            <p>
              Great progress! Try adding 1–2 extra reps or an extra set next
              time. Your clinician will be notified to review your plan.
            </p>
          </div>
        )}

        {/* Note textarea */}
        <div>
          <Label className="text-xs text-slate-500 uppercase tracking-wide">
            Add a note (optional)
          </Label>
          <Textarea
            placeholder="Describe what you felt..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1.5 text-sm resize-none"
          />
        </div>

        <div className="flex gap-2">
          <Button
            className="flex-1 gap-1.5"
            onClick={handleSubmit}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Next Exercise
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-slate-600"
            onClick={() => setChoice(null)}
            disabled={busy}
          >
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        How did that go?
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => handleChoiceClick("completed")}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Completed
        </button>

        <button
          type="button"
          onClick={() => handleChoiceClick("discomfort")}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
        >
          <AlertTriangle className="h-4 w-4" />
          Discomfort
        </button>

        <button
          type="button"
          onClick={() => handleChoiceClick("pain")}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          <AlertTriangle className="h-4 w-4" />
          Pain / Too Hard
        </button>

        <button
          type="button"
          onClick={() => handleChoiceClick("too-easy")}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 text-sm font-semibold text-purple-600 hover:bg-purple-100 disabled:opacity-50 transition-colors"
        >
          <TrendingUp className="h-4 w-4" />
          Too Easy
        </button>
      </div>

      <button
        type="button"
        onClick={onSkip}
        disabled={busy}
        className="w-full py-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
      >
        Skip this exercise
      </button>
    </div>
  );
}

// ─── Workout Flow Mode ────────────────────────────────────────────────────────

function WorkoutFlowScreen({
  exercise,
  currentIndex,
  totalExercises,
  completedCount,
  timer,
  onAction,
  onSkip,
  onAbandon,
}: {
  exercise: PlanExerciseWithExercise;
  currentIndex: number;
  totalExercises: number;
  completedCount: number;
  timer: number;
  onAction: (feeling: Exclude<FeelingChoice, null>, note: string) => Promise<void>;
  onSkip: () => Promise<void>;
  onAbandon: () => void;
}) {
  // Reset feedback panel when exercise changes
  const [panelKey, setPanelKey] = useState(0);
  const [submitting] = useState(false);

  useEffect(() => {
    setPanelKey((k) => k + 1);
  }, [exercise.id]);

  const progress =
    totalExercises > 0 ? (completedCount / totalExercises) * 100 : 0;

  const hasVideo =
    !!exercise.exercise.videoUrl || exercise.exercise.media.length > 0;

  return (
    <div className="max-w-lg mx-auto space-y-3 pb-6">
      {/* Top bar */}
      <div className="flex items-center justify-between pt-1">
        <span className="font-mono text-sm font-medium text-slate-500">
          {formatTime(timer)}
        </span>
        <span className="text-sm font-semibold text-slate-700">
          {currentIndex + 1} / {totalExercises}
        </span>
        <button
          type="button"
          onClick={onAbandon}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-red-500 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          End
        </button>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress value={progress} className="h-1.5" />
        <p className="text-center text-xs text-slate-400">
          {completedCount} of {totalExercises} done
        </p>
      </div>

      {/* Exercise card */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Video — front and center */}
        {hasVideo ? (
          <ExerciseVideoPlayer
            videoUrl={exercise.exercise.videoUrl}
            mediaItems={exercise.exercise.media}
          />
        ) : (
          <div className="flex aspect-video items-center justify-center bg-linear-to-br from-slate-100 to-slate-200">
            <span className="text-sm text-slate-400">No video available</span>
          </div>
        )}

        {/* Exercise info */}
        <div className="p-4 space-y-3">
          <h2 className="text-xl font-bold leading-tight text-slate-900">
            {exercise.exercise.name}
          </h2>

          {/* Prescription pills */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
              {exercise.sets} sets
            </span>
            {exercise.reps && (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                {exercise.reps} reps
              </span>
            )}
            {exercise.durationSeconds && (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                {exercise.durationSeconds}s hold
              </span>
            )}
            {exercise.restSeconds && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {exercise.restSeconds}s rest
              </span>
            )}
          </div>

          {/* Clinician notes */}
          {exercise.notes && (
            <p className="border-l-2 border-blue-200 pl-3 text-sm italic text-slate-500">
              {exercise.notes}
            </p>
          )}

          {/* Collapsible instructions */}
          {exercise.exercise.instructions && (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs font-medium uppercase tracking-wide text-slate-400 hover:text-slate-600 select-none">
                Instructions ▸
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-500">
                {exercise.exercise.instructions}
              </p>
            </details>
          )}
        </div>

        {/* Feedback panel — resets on exercise change via key */}
        <FeedbackPanel
          key={panelKey}
          onAction={onAction}
          onSkip={onSkip}
          submitting={submitting}
        />
      </div>
    </div>
  );
}

// ─── End Session Dialog ───────────────────────────────────────────────────────

function EndSessionDialog({
  open,
  onOpenChange,
  completedCount,
  skippedCount,
  totalExercises,
  onComplete,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  completedCount: number;
  skippedCount: number;
  totalExercises: number;
  onComplete: (painLevel: number, notes: string) => Promise<void>;
  isLoading: boolean;
}) {
  const [painLevel, setPainLevel] = useState(0);
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Workout Complete!</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-500">
            You completed{" "}
            <span className="font-semibold text-slate-800">
              {completedCount}
            </span>{" "}
            of {totalExercises} exercises
            {skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}.
          </p>

          <div>
            <Label className="text-sm">
              Overall Pain Level:{" "}
              <span className="font-semibold">{painLevel}/10</span>
            </Label>
            <Input
              type="range"
              min={0}
              max={10}
              value={painLevel}
              onChange={(e) => setPainLevel(Number(e.target.value))}
              className="mt-2"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>No pain</span>
              <span>Severe pain</span>
            </div>
          </div>

          <div>
            <Label className="text-sm">Overall notes (optional)</Label>
            <Textarea
              placeholder="How did the workout feel overall?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-2"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => onComplete(painLevel, notes)}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Save & Finish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WorkoutSessionTracker({ plan }: WorkoutSessionTrackerProps) {
  const router = useRouter();

  const [screen, setScreen] = useState<WorkoutScreen>("overview");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  const activeExercises = plan.exercises
    .filter((e) => e.isActive)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const totalExercises = activeExercises.length;
  const doneCount = completedIds.size + skippedIds.size;
  const currentExercise = activeExercises[currentIndex];

  // Timer
  useEffect(() => {
    if (!timerActive) return;
    const interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [timerActive]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleStart = async () => {
    setIsLoading(true);
    const result = await startWorkoutSession(plan.id);
    if (result.success && result.data) {
      setSessionId(result.data.id);
      setTimerActive(true);
      setScreen("workout");
    } else {
      toast.error(result.error ?? "Failed to start session");
    }
    setIsLoading(false);
  };

  const handleAction = async (
    feeling: Exclude<FeelingChoice, null>,
    note: string
  ) => {
    if (!sessionId || !currentExercise) return;

    await completeSessionExercise(sessionId, currentExercise.id, {
      status: "completed",
      actualSets: currentExercise.sets,
      actualReps: currentExercise.reps ?? undefined,
    });
    setCompletedIds((prev) => new Set(prev).add(currentExercise.id));

    // Submit per-exercise feedback for non-completed feelings
    if (feeling !== "completed") {
      const ratingMap = {
        discomfort: "MILD_DISCOMFORT",
        pain: "PAINFUL",
        "too-easy": "FELT_GOOD",
      } as const;
      const comment =
        feeling === "too-easy" && !note
          ? "Too easy — progression suggested"
          : note || undefined;

      // Fire-and-forget — don't block workout flow on feedback save
      submitFeedbackAction({
        planExerciseId: currentExercise.id,
        rating: ratingMap[feeling as keyof typeof ratingMap],
        comment,
      }).catch(() => toast.error("Feedback couldn't be saved, but workout continues"));
    }

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

  const handleEndSession = async (painLevel: number, notes: string) => {
    if (!sessionId) return;
    setIsLoading(true);
    const result = await completeWorkoutSession(sessionId, {
      overallPainLevel: painLevel,
      notes: notes || undefined,
    });
    if (result.success) {
      toast.success("Workout complete! Great work!");
      router.push(ROUTES.WORKOUT_PLAN_DETAIL(plan.id));
    } else {
      toast.error(result.error ?? "Failed to complete session");
      setIsLoading(false);
    }
  };

  const handleAbandon = async () => {
    if (!sessionId) return;
    setTimerActive(false);
    await abandonWorkoutSession(sessionId);
    toast.info("Session ended");
    router.push(ROUTES.WORKOUT_PLAN_DETAIL(plan.id));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {screen === "overview" && (
        <OverviewScreen
          plan={plan}
          onStart={handleStart}
          isLoading={isLoading}
        />
      )}

      {screen === "workout" && currentExercise && (
        <WorkoutFlowScreen
          exercise={currentExercise}
          currentIndex={currentIndex}
          totalExercises={totalExercises}
          completedCount={doneCount}
          timer={timer}
          onAction={handleAction}
          onSkip={handleSkip}
          onAbandon={handleAbandon}
        />
      )}

      <EndSessionDialog
        open={showEndDialog}
        onOpenChange={setShowEndDialog}
        completedCount={completedIds.size}
        skippedCount={skippedIds.size}
        totalExercises={totalExercises}
        onComplete={handleEndSession}
        isLoading={isLoading}
      />
    </>
  );
}

