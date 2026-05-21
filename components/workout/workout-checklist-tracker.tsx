"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { markExerciseDoneAction, completeSessionV2Action } from "@/actions/session-v2-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, Trophy, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
type MediaItem = { id: string; url: string; type: string };
type BaseExercise = {
  id: string;
  name: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  bodyRegion?: string | null;
  instructions?: string | null;
  media: MediaItem[];
};
type BlockExerciseSet = {
  id: string;
  orderIndex: number;
  targetReps?: number | null;
  targetDuration?: number | null;
  targetWeight?: number | null;
};
type SessionExerciseLog = {
  id: string;
  blockExerciseId: string;
  status: string;
  setLogs: { id: string; setIndex: number }[];
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
  type: string;
  rounds: number;
  restBetweenRounds?: number | null;
  name?: string | null;
  exercises: BlockExercise[];
};
type WorkoutSessionV2 = {
  id: string;
  status: string;
  workout: { id: string; name: string; blocks: WorkoutBlock[] };
  exerciseLogs: SessionExerciseLog[];
};

function isCircuitBlock(type: string) {
  const t = type.toUpperCase();
  return t === "CIRCUIT" || t === "SUPERSET" || t === "WARMUP" || t === "COOLDOWN";
}

function getPrescriptionText(ex: BlockExercise, block: WorkoutBlock): string {
  const rounds = isCircuitBlock(block.type) ? block.rounds : 1;
  const set = ex.sets[0];
  if (!set) return "";
  const setsLabel = isCircuitBlock(block.type)
    ? rounds > 1
      ? `${rounds} rounds`
      : "1 round"
    : `${ex.sets.length} ${ex.sets.length === 1 ? "set" : "sets"}`;
  if (set.targetReps) return `${setsLabel} × ${set.targetReps} reps`;
  if (set.targetDuration) return `${setsLabel} × ${set.targetDuration}s`;
  return setsLabel;
}

interface Props {
  session: WorkoutSessionV2;
  onSwitchMode: () => void;
  additionalCompleted?: Set<string>;
  onExerciseToggle?: (blockExerciseId: string, done: boolean) => void;
}

export function WorkoutChecklistTracker({ session, onSwitchMode, additionalCompleted, onExerciseToggle }: Props) {
  const router = useRouter();

  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const log of session.exerciseLogs) {
      if (log.status === "COMPLETED") s.add(log.blockExerciseId);
    }
    if (additionalCompleted) additionalCompleted.forEach((id) => s.add(id));
    return s;
  });

  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(
    () => new Set(session.workout.blocks.map((b) => b.id))
  );
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [rpe, setRpe] = useState(5);
  const [notes, setNotes] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);

  const allExercises = session.workout.blocks.flatMap((b) => b.exercises);
  const totalCount = allExercises.length;
  const doneCount = allExercises.filter((ex) => checkedIds.has(ex.id)).length;
  const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  async function handleToggle(block: WorkoutBlock, ex: BlockExercise) {
    const isDone = checkedIds.has(ex.id);
    const newDone = !isDone;
    setLoadingId(ex.id);

    // Optimistic update
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (newDone) next.add(ex.id);
      else next.delete(ex.id);
      return next;
    });
    onExerciseToggle?.(ex.id, newDone);

    const setCount = isCircuitBlock(block.type) ? block.rounds : ex.sets.length;
    const result = await markExerciseDoneAction(session.id, ex.id, setCount, newDone);
    if (!result.success) {
      // Revert
      setCheckedIds((prev) => {
        const next = new Set(prev);
        if (!newDone) next.add(ex.id);
        else next.delete(ex.id);
        return next;
      });
      onExerciseToggle?.(ex.id, !newDone);
      toast.error(result.error ?? "Failed to update");
    }
    setLoadingId(null);
  }

  async function handleFinish() {
    setIsCompleting(true);
    const result = await completeSessionV2Action(session.id, rpe, notes || undefined);
    if (result.success) {
      toast.success("Workout completed! Great work!");
      router.push("/dashboard");
    } else {
      toast.error(result.error ?? "Failed to complete session");
    }
    setIsCompleting(false);
  }

  function toggleBlock(blockId: string) {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-24">
      {/* Header bar */}
      <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <span className="text-sm font-semibold">Quick Checklist</span>
        </div>
        <Badge variant="outline" className="font-semibold">
          {doneCount} / {totalCount}
        </Badge>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onSwitchMode}>
          Switch to Session
        </Button>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <Progress value={progress} className="h-2 rounded-full" />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{Math.round(progress)}% complete</span>
          <span>{totalCount - doneCount} remaining</span>
        </div>
      </div>

      {/* Blocks */}
      {session.workout.blocks.map((block) => {
        const isExpanded = expandedBlocks.has(block.id);
        const blockDone = block.exercises.filter((ex) => checkedIds.has(ex.id)).length;
        const blockTotal = block.exercises.length;
        const blockName = block.name || block.type;
        const isCircuit = isCircuitBlock(block.type);

        return (
          <Card key={block.id} className="overflow-hidden border-0 shadow-sm ring-1 ring-border/50">
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              onClick={() => toggleBlock(block.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{blockName}</span>
                  {isCircuit && block.rounds > 1 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {block.rounds} rounds
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {blockDone}/{blockTotal} exercises done
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {blockDone === blockTotal && blockTotal > 0 && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-1.5">Done</Badge>
                )}
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {isExpanded && (
              <CardContent className="p-0 border-t">
                {block.exercises.map((ex, i) => {
                  const done = checkedIds.has(ex.id);
                  const loading = loadingId === ex.id;
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                        i > 0 && "border-t border-border/40",
                        done ? "bg-emerald-50/50" : "hover:bg-muted/30"
                      )}
                      onClick={() => !loading && handleToggle(block, ex)}
                      disabled={loading}
                    >
                      <div
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          done ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/30 bg-background"
                        )}
                      >
                        {loading ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        ) : done ? (
                          <Check className="h-3 w-3 text-white" />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium", done && "line-through text-muted-foreground")}>
                          {ex.exercise.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{getPrescriptionText(ex, block)}</p>
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Finish button */}
      <Button
        size="lg"
        className="w-full bg-linear-to-r from-emerald-500 to-teal-500 border-0 text-white shadow-md hover:from-emerald-600 hover:to-teal-600"
        onClick={() => setShowEndDialog(true)}
      >
        <Trophy className="mr-2 h-4 w-4" />
        Finish Workout
      </Button>

      {/* End dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25">
              <Trophy className="h-8 w-8 text-white" />
            </div>
            <DialogTitle className="text-center text-xl">Great work!</DialogTitle>
            <p className="text-center text-sm text-muted-foreground">
              You completed {doneCount} of {totalCount} exercises.
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
              <div className="mt-2 flex gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i < rpe ? (i < 4 ? "bg-emerald-500" : i < 7 ? "bg-amber-500" : "bg-red-500") : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Session Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                placeholder="How did it feel?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowEndDialog(false)}>
              Back
            </Button>
            <Button
              className="flex-1 bg-linear-to-r from-emerald-500 to-teal-500 border-0 text-white hover:from-emerald-600 hover:to-teal-600"
              onClick={handleFinish}
              disabled={isCompleting}
            >
              {isCompleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Complete Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
