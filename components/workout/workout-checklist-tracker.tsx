"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateSetLogV2Action, completeSessionV2Action, updateExerciseActualSetsAction, updateExerciseClientNoteAction } from "@/actions/session-v2-actions";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExerciseVideoPlayer } from "@/components/exercises/exercise-video-player";
import {
  Check, Trophy, Loader2, ChevronDown, ChevronUp, ChevronRight,
  AlertCircle, Plus, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SetLogEntry, SetLogCache } from "./types";
import { VoiceMemoRecorder } from "@/components/voice-memo/VoiceMemoRecorder";
import { getWorkoutVoiceMemos } from "@/actions/voice-memo-actions";
import type { VoiceMemoData } from "@/actions/voice-memo-actions";

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
  restAfter?: number | null;
};
type SessionExerciseLog = {
  id: string;
  blockExerciseId: string;
  status: string;
  actualSets?: number | null;
  clientNote?: string | null;
  setLogs: { id: string; setIndex: number; actualReps?: number | null; actualWeight?: number | null; actualDuration?: number | null }[];
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function isCircuitBlock(type: string) {
  const t = type.toUpperCase();
  return t === "CIRCUIT" || t === "SUPERSET" || t === "WARMUP" || t === "COOLDOWN";
}

function getPrescriptionText(ex: BlockExercise, block: WorkoutBlock): string {
  const isCircuit = isCircuitBlock(block.type);
  const rounds = isCircuit ? block.rounds : 1;
  const set = ex.sets[0];
  if (!set) return "";
  const setsLabel = isCircuit
    ? `${rounds} ${rounds === 1 ? "set" : "sets"}`
    : `${ex.sets.length} ${ex.sets.length === 1 ? "set" : "sets"}`;
  if (set.targetReps) return `${setsLabel} × ${set.targetReps} reps`;
  if (set.targetDuration) return `${setsLabel} × ${set.targetDuration}s`;
  return setsLabel;
}

function getSetCount(ex: BlockExercise, block: WorkoutBlock): number {
  return isCircuitBlock(block.type) ? Math.max(1, block.rounds ?? 1) : ex.sets.length;
}

function getExerciseStatus(
  blockExerciseId: string,
  setCount: number,
  logs: SetLogCache
): "pending" | "partial" | "complete" {
  if (setCount === 0) return "complete";
  const exLogs = logs[blockExerciseId];
  if (!exLogs) return "pending";
  const completedCount = Object.values(exLogs).filter((l) => l.completed).length;
  if (completedCount === 0) return "pending";
  if (completedCount >= setCount) return "complete";
  return "partial";
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  session: WorkoutSessionV2;
  onSwitchMode: () => void;
  additionalCompleted?: Set<string>;
  setLogCache?: SetLogCache;
  onSetLogged?: (blockExerciseId: string, setIndex: number, data: SetLogEntry) => void;
}

export function WorkoutChecklistTracker({
  session,
  onSwitchMode,
  additionalCompleted,
  setLogCache: externalCache,
  onSetLogged,
}: Props) {
  const router = useRouter();

  // ── Set log state ──────────────────────────────────────────────────────────
  const [exerciseSetLogs, setExerciseSetLogs] = useState<SetLogCache>(() => {
    const result: SetLogCache = {};
    for (const log of session.exerciseLogs) {
      for (const sl of log.setLogs) {
        if (!result[log.blockExerciseId]) result[log.blockExerciseId] = {};
        result[log.blockExerciseId][sl.setIndex] = {
          actualReps: sl.actualReps ?? undefined,
          actualWeight: sl.actualWeight ?? undefined,
          actualDuration: sl.actualDuration ?? undefined,
          completed: true,
        };
      }
    }
    // Merge external cache (set in session mode before switching here)
    if (externalCache) {
      for (const [id, sets] of Object.entries(externalCache)) {
        result[id] = { ...(result[id] ?? {}), ...sets };
      }
    }
    return result;
  });

  // Pending input values (before the user taps "Done")
  const [pendingInputs, setPendingInputs] = useState<
    Record<string, { actualReps?: number; actualWeight?: number; actualDuration?: number }>
  >({});

  // Keys of sets where the user clicked "Can't do" — value is the typed reason
  const [pendingSkips, setPendingSkips] = useState<Record<string, string>>({});

  // Actual sets logged per exercise (exercise-level, separate from per-set rows)
  const [actualSetsByExercise, setActualSetsByExercise] = useState<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    for (const log of session.exerciseLogs) {
      if (log.actualSets != null) result[log.blockExerciseId] = log.actualSets;
    }
    return result;
  });

  // Client's own note per exercise, auto-saved as they type
  const [clientNotes, setClientNotes] = useState<Record<string, string>>(() => {
    const result: Record<string, string> = {};
    for (const log of session.exerciseLogs) {
      if (log.clientNote) result[log.blockExerciseId] = log.clientNote;
    }
    return result;
  });

  const saveClientNote = useDebouncedCallback((blockExerciseId: string, note: string) => {
    updateExerciseClientNoteAction(session.id, blockExerciseId, note);
  }, 600);

  function handleClientNoteChange(blockExerciseId: string, note: string) {
    setClientNotes((prev) => ({ ...prev, [blockExerciseId]: note }));
    saveClientNote(blockExerciseId, note);
  }

  const [loggingKey, setLoggingKey] = useState<string | null>(null);

  // Extra sets the client adds beyond what was prescribed
  const [extraSetCounts, setExtraSetCounts] = useState<Record<string, number>>({});

  function addExtraSet(exerciseId: string) {
    setExtraSetCounts((prev) => ({ ...prev, [exerciseId]: (prev[exerciseId] ?? 0) + 1 }));
  }

  function removeExtraSet(exerciseId: string, setIndex: number) {
    if (exerciseSetLogs[exerciseId]?.[setIndex]?.completed) return;
    setExtraSetCounts((prev) => ({ ...prev, [exerciseId]: Math.max(0, (prev[exerciseId] ?? 0) - 1) }));
    setPendingInputs((prev) => {
      const next = { ...prev };
      delete next[inputKey(exerciseId, setIndex)];
      return next;
    });
  }

  // ── Accordion state ────────────────────────────────────────────────────────
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(
    () => new Set(session.workout.blocks.map((b) => b.id))
  );

  const [expandedExercises, setExpandedExercises] = useState<Set<string>>(() => {
    // Build the initial logs cache inline (can't reference sibling useState)
    const initialLogs: SetLogCache = {};
    for (const log of session.exerciseLogs) {
      for (const sl of log.setLogs) {
        if (!initialLogs[log.blockExerciseId]) initialLogs[log.blockExerciseId] = {};
        initialLogs[log.blockExerciseId][sl.setIndex] = { completed: true };
      }
    }
    if (externalCache) {
      for (const [id, sets] of Object.entries(externalCache)) {
        initialLogs[id] = { ...(initialLogs[id] ?? {}), ...sets };
      }
    }
    // Auto-open the first incomplete exercise
    for (const block of session.workout.blocks) {
      for (const ex of block.exercises) {
        const setCount = getSetCount(ex, block);
        const status = getExerciseStatus(ex.id, setCount, initialLogs);
        if (status !== "complete" && !additionalCompleted?.has(ex.id)) {
          return new Set([ex.id]);
        }
      }
    }
    return new Set();
  });

  // ── Finish dialog ──────────────────────────────────────────────────────────
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [rpe, setRpe] = useState(5);
  const [notes, setNotes] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [clientMemo, setClientMemo] = useState<VoiceMemoData | null>(null);
  const [memosLoaded, setMemosLoaded] = useState(false);

  // Load voice memos when the end dialog opens
  useEffect(() => {
    if (!showEndDialog || memosLoaded) return;
    getWorkoutVoiceMemos(session.workout.id).then((result) => {
      if (result.success && result.data) {
        setClientMemo(result.data.client);
      }
      setMemosLoaded(true);
    });
  }, [showEndDialog, memosLoaded, session.workout.id]);

  // ── Derived progress ───────────────────────────────────────────────────────
  const allExercises = session.workout.blocks.flatMap((b) =>
    b.exercises.map((ex) => ({ ex, block: b }))
  );
  const totalCount = allExercises.length;
  const doneCount = allExercises.filter(({ ex, block }) => {
    if (additionalCompleted?.has(ex.id)) return true;
    const setCount = getSetCount(ex, block);
    return getExerciseStatus(ex.id, setCount, exerciseSetLogs) === "complete";
  }).length;
  const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  // ── Handlers ───────────────────────────────────────────────────────────────
  function inputKey(exerciseId: string, setIndex: number) {
    return `${exerciseId}_${setIndex}`;
  }

  function handleInputChange(
    exerciseId: string,
    setIndex: number,
    field: "actualReps" | "actualWeight" | "actualDuration",
    value: string
  ) {
    const key = inputKey(exerciseId, setIndex);
    setPendingInputs((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? {}),
        [field]: value === "" ? undefined : Number(value),
      },
    }));
  }

  async function handleLogSet(
    block: WorkoutBlock,
    ex: BlockExercise,
    setIndex: number,
    skipSet = false,
    skipReason?: string,
    skipKey?: string
  ) {
    const key = inputKey(ex.id, setIndex);
    setLoggingKey(key);

    const pending = pendingInputs[key] ?? {};
    const data = skipSet
      ? { actualReps: 0, notes: skipReason || undefined }
      : {
          actualReps: pending.actualReps,
          actualWeight: pending.actualWeight,
          actualDuration: pending.actualDuration,
        };

    const result = await updateSetLogV2Action(session.id, ex.id, setIndex, data);

    if (result.success) {
      if (skipKey) {
        setPendingSkips((prev) => {
          const next = { ...prev };
          delete next[skipKey];
          return next;
        });
      }

      const entry: SetLogEntry = { ...data, completed: true };

      // loggingKey prevents concurrent logging, so exerciseSetLogs is current
      // for all previously-logged sets. Build the updated state synchronously.
      const updatedExLogs = {
        ...(exerciseSetLogs[ex.id] ?? {}),
        [setIndex]: entry,
      };
      const setCount = getSetCount(ex, block);
      const allDone = Array.from({ length: setCount }, (_, i) => i).every(
        (i) => updatedExLogs[i]?.completed
      );

      setExerciseSetLogs((prev) => ({
        ...prev,
        [ex.id]: { ...(prev[ex.id] ?? {}), [setIndex]: entry },
      }));

      onSetLogged?.(ex.id, setIndex, entry);

      if (allDone) {
        setExpandedExercises((prev) => {
          const next = new Set(prev);
          next.delete(ex.id);
          return next;
        });
        // Auto-open next incomplete exercise
        const updatedCache: SetLogCache = { ...exerciseSetLogs, [ex.id]: updatedExLogs };
        let found = false;
        for (const b of session.workout.blocks) {
          for (const e of b.exercises) {
            if (found) {
              const sc = getSetCount(e, b);
              const st = getExerciseStatus(e.id, sc, updatedCache);
              if (st !== "complete" && !additionalCompleted?.has(e.id)) {
                setExpandedExercises((prev) => new Set([...prev, e.id]));
                break;
              }
            }
            if (e.id === ex.id) found = true;
          }
        }
      }
    } else {
      toast.error(result.error ?? "Failed to log set");
    }

    setLoggingKey(null);
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg space-y-4 pb-24">
      {/* Header */}
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
        const isBlockExpanded = expandedBlocks.has(block.id);
        const blockDone = block.exercises.filter((ex) => {
          if (additionalCompleted?.has(ex.id)) return true;
          const sc = getSetCount(ex, block);
          return getExerciseStatus(ex.id, sc, exerciseSetLogs) === "complete";
        }).length;
        const blockTotal = block.exercises.length;
        const blockName = block.name || block.type;
        const isCircuit = isCircuitBlock(block.type);

        return (
          <Card key={block.id} className="overflow-hidden border-0 shadow-sm ring-1 ring-border/50">
            {/* Block header */}
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              onClick={() =>
                setExpandedBlocks((prev) => {
                  const next = new Set(prev);
                  if (next.has(block.id)) next.delete(block.id);
                  else next.add(block.id);
                  return next;
                })
              }
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{blockName}</span>
                  {isCircuit && block.rounds > 1 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {block.rounds} sets
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
                {isBlockExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {/* Exercise rows */}
            {isBlockExpanded && (
              <CardContent className="p-0 border-t divide-y divide-border/40">
                {block.exercises.map((ex) => {
                  const isFullyDone =
                    additionalCompleted?.has(ex.id) ||
                    getExerciseStatus(ex.id, getSetCount(ex, block), exerciseSetLogs) === "complete";
                  const isPartial =
                    getExerciseStatus(ex.id, getSetCount(ex, block), exerciseSetLogs) === "partial";
                  const isExOpen = expandedExercises.has(ex.id);
                  const setCount = getSetCount(ex, block);
                  const hasVideo =
                    ex.exercise.videoUrl || ex.exercise.media.some((m) => m.type === "VIDEO");

                  return (
                    <div key={ex.id}>
                      {/* Exercise header row */}
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                          isFullyDone ? "bg-emerald-50/50" : isPartial ? "bg-amber-50/30" : "hover:bg-muted/30"
                        )}
                        onClick={() =>
                          setExpandedExercises((prev) => {
                            const next = new Set(prev);
                            if (next.has(ex.id)) next.delete(ex.id);
                            else next.add(ex.id);
                            return next;
                          })
                        }
                      >
                        {/* Status indicator */}
                        <div
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            isFullyDone
                              ? "border-emerald-500 bg-emerald-500"
                              : isPartial
                              ? "border-amber-400 bg-amber-400"
                              : "border-muted-foreground/30 bg-background"
                          )}
                        >
                          {isFullyDone ? (
                            <Check className="h-3 w-3 text-white" />
                          ) : isPartial ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          ) : null}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              "text-sm font-medium",
                              isFullyDone && "text-muted-foreground"
                            )}
                          >
                            {ex.exercise.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {getPrescriptionText(ex, block)}
                            {isPartial && (
                              <span className="ml-1.5 text-amber-600 font-medium">· partial</span>
                            )}
                          </p>
                        </div>

                        <ChevronRight
                          className={cn(
                            "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                            isExOpen && "rotate-90"
                          )}
                        />
                      </button>

                      {/* Exercise body */}
                      {isExOpen && (
                        <div className="px-4 pb-4 pt-2 bg-muted/20 space-y-3">
                          {/* Info chips */}
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="secondary" className="text-[11px]">
                              {`${isCircuit ? block.rounds : ex.sets.length} sets`}
                            </Badge>
                            {ex.sets[0]?.targetReps && (
                              <Badge variant="secondary" className="text-[11px]">
                                {ex.sets[0].targetReps} reps
                              </Badge>
                            )}
                            {ex.sets[0]?.targetDuration && (
                              <Badge variant="secondary" className="text-[11px]">
                                {ex.sets[0].targetDuration}s hold
                              </Badge>
                            )}
                            {ex.sets[0]?.restAfter && (
                              <Badge variant="secondary" className="text-[11px]">
                                {ex.sets[0].restAfter}s rest
                              </Badge>
                            )}
                            {ex.exercise.bodyRegion && (
                              <Badge variant="outline" className="text-[11px]">
                                {ex.exercise.bodyRegion}
                              </Badge>
                            )}
                          </div>

                          {/* Video */}
                          {hasVideo && (
                            <ExerciseVideoPlayer
                              videoUrl={ex.exercise.videoUrl ?? undefined}
                              mediaItems={ex.exercise.media.map((m) => ({
                                id: m.id,
                                url: m.url,
                                mediaType: m.type,
                              }))}
                            />
                          )}

                          {/* Instructions */}
                          {ex.exercise.instructions && (
                            <div className="rounded-xl bg-muted/60 px-3 py-2.5">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                                Instructions
                              </p>
                              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                                {ex.exercise.instructions}
                              </p>
                            </div>
                          )}

                          {/* Trainer notes */}
                          {ex.notes && (
                            <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5">
                              <span className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-500 shrink-0">
                                Note
                              </span>
                              <p className="text-sm italic text-blue-700">{ex.notes}</p>
                            </div>
                          )}

                          {/* Per-set logging table */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                                Actual Sets
                              </p>
                              {setCount > 1 && (
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    type="number"
                                    min={0}
                                    placeholder="—"
                                    value={actualSetsByExercise[ex.id] ?? ""}
                                    onChange={(e) => {
                                      const val = e.target.value === "" ? undefined : Number(e.target.value);
                                      setActualSetsByExercise((prev) => {
                                        const next = { ...prev };
                                        if (val === undefined) delete next[ex.id];
                                        else next[ex.id] = val;
                                        return next;
                                      });
                                      updateExerciseActualSetsAction(
                                        session.id,
                                        ex.id,
                                        e.target.value === "" ? null : Number(e.target.value)
                                      );
                                    }}
                                    className="h-8 w-20 text-sm text-center"
                                  />
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">sets done</span>
                                </div>
                              )}
                              {isFullyDone && (
                                <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-0.5 ml-auto">
                                  <Check className="h-3 w-3" /> All done
                                </span>
                              )}
                            </div>

                            {setCount === 0 && (
                              <p className="text-xs text-muted-foreground">No sets prescribed.</p>
                            )}

                            {Array.from(
                              { length: setCount + (extraSetCounts[ex.id] ?? 0) },
                              (_, i) => {
                                const isExtra = i >= setCount;
                                const setDef = isExtra
                                  ? null
                                  : isCircuit
                                  ? ex.sets[0]
                                  : ex.sets[i];
                                const logEntry = exerciseSetLogs[ex.id]?.[i];
                                const isDone = logEntry?.completed ?? false;
                                const key = inputKey(ex.id, i);
                                const pending = pendingInputs[key] ?? {};
                                const isLogging = loggingKey === key;
                                const isLastExtra =
                                  isExtra && i === setCount + (extraSetCounts[ex.id] ?? 0) - 1;

                                return (
                                  <div
                                    key={i}
                                    className={cn(
                                      "rounded-xl border p-3 transition-colors",
                                      isDone
                                        ? "border-emerald-200 bg-emerald-50/50"
                                        : isExtra
                                        ? "border-dashed border-muted-foreground/30 bg-background"
                                        : "border-border bg-background"
                                    )}
                                  >
                                    {/* Set header */}
                                    <div className="flex items-center gap-2 mb-2">
                                      <div
                                        className={cn(
                                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                          isDone
                                            ? "bg-emerald-500 text-white"
                                            : "bg-primary/10 text-primary"
                                        )}
                                      >
                                        {isDone ? <Check className="h-3 w-3" /> : i + 1}
                                      </div>
                                      <span className="text-xs text-muted-foreground">
                                        {`Set ${i + 1}`}
                                        {isExtra && (
                                          <span className="ml-1 text-[10px] text-muted-foreground/60">(extra)</span>
                                        )}
                                        {setDef?.targetReps && ` · target ${setDef.targetReps} reps`}
                                        {setDef?.targetDuration && ` · target ${setDef.targetDuration}s`}
                                      </span>
                                      {/* Remove button for last unlogged extra set */}
                                      {isLastExtra && !isDone && (
                                        <button
                                          type="button"
                                          className="ml-auto text-muted-foreground hover:text-destructive"
                                          onClick={() => removeExtraSet(ex.id, i)}
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      {isDone && logEntry?.actualReps === 0 && !logEntry?.actualDuration && (
                                        <Badge
                                          variant="outline"
                                          className="ml-auto text-[10px] text-amber-600 border-amber-200 bg-amber-50"
                                        >
                                          Skipped
                                        </Badge>
                                      )}
                                      {isDone && (logEntry?.actualReps ?? 0) > 0 && (
                                        <span className={cn("text-[11px] text-emerald-600 font-medium", !isLastExtra && "ml-auto")}>
                                          {logEntry?.actualReps} reps
                                          {logEntry?.actualWeight ? ` @ ${logEntry.actualWeight} lbs` : ""}
                                        </span>
                                      )}
                                      {isDone && logEntry?.actualDuration && (
                                        <span className={cn("text-[11px] text-emerald-600 font-medium", !isLastExtra && "ml-auto")}>
                                          {logEntry.actualDuration}s
                                        </span>
                                      )}
                                    </div>

                                    {/* Inputs — hidden when done */}
                                    {!isDone && (
                                      <div className="flex flex-wrap gap-2 items-end">
                                        {/* Reps: always show for extra sets; for prescribed show when target reps or no duration */}
                                        {(isExtra || setDef?.targetReps != null || !setDef?.targetDuration) && (
                                          <div className="space-y-0.5">
                                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                              Actual reps
                                            </Label>
                                            <Input
                                              type="number"
                                              min={0}
                                              placeholder={setDef?.targetReps?.toString() ?? "0"}
                                              value={pending.actualReps ?? ""}
                                              onChange={(e) =>
                                                handleInputChange(ex.id, i, "actualReps", e.target.value)
                                              }
                                              className="h-8 w-24 text-sm"
                                            />
                                          </div>
                                        )}
                                        {(isExtra || setDef?.targetDuration != null) && (
                                          <div className="space-y-0.5">
                                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                              Actual secs
                                            </Label>
                                            <Input
                                              type="number"
                                              min={0}
                                              placeholder={setDef?.targetDuration?.toString() ?? "0"}
                                              value={pending.actualDuration ?? ""}
                                              onChange={(e) =>
                                                handleInputChange(ex.id, i, "actualDuration", e.target.value)
                                              }
                                              className="h-8 w-24 text-sm"
                                            />
                                          </div>
                                        )}
                                        {(isExtra || setDef?.targetWeight != null) && (
                                          <div className="space-y-0.5">
                                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                              Weight (lbs)
                                            </Label>
                                            <Input
                                              type="number"
                                              min={0}
                                              placeholder={setDef?.targetWeight?.toString() ?? "0"}
                                              value={pending.actualWeight ?? ""}
                                              onChange={(e) =>
                                                handleInputChange(ex.id, i, "actualWeight", e.target.value)
                                              }
                                              className="h-8 w-24 text-sm"
                                            />
                                          </div>
                                        )}

                                        <div className="flex gap-1.5 ml-auto">
                                          <Button
                                            size="sm"
                                            className="h-8 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-0 text-xs"
                                            onClick={() => handleLogSet(block, ex, i)}
                                            disabled={isLogging}
                                          >
                                            {isLogging ? (
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                              <Check className="h-3 w-3" />
                                            )}
                                            Done
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 gap-1 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
                                            onClick={() =>
                                              setPendingSkips((prev) => ({ ...prev, [inputKey(ex.id, i)]: "" }))
                                            }
                                            disabled={isLogging || inputKey(ex.id, i) in pendingSkips}
                                          >
                                            <AlertCircle className="h-3 w-3" />
                                            Can&apos;t do
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                    {inputKey(ex.id, i) in pendingSkips && (
                                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 space-y-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                                          Why can&apos;t you do this? (optional)
                                        </p>
                                        <Textarea
                                          className="h-16 text-xs resize-none bg-white"
                                          placeholder="Pain, equipment issue, form concern…"
                                          value={pendingSkips[inputKey(ex.id, i)] ?? ""}
                                          onChange={(e) =>
                                            setPendingSkips((prev) => ({
                                              ...prev,
                                              [inputKey(ex.id, i)]: e.target.value,
                                            }))
                                          }
                                        />
                                        <div className="flex gap-1.5">
                                          <Button
                                            size="sm"
                                            className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0"
                                            onClick={() => {
                                              const key = inputKey(ex.id, i);
                                              const reason = pendingSkips[key] || undefined;
                                              handleLogSet(block, ex, i, true, reason, key);
                                            }}
                                            disabled={isLogging}
                                          >
                                            Skip this set
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 text-xs"
                                            onClick={() =>
                                              setPendingSkips((prev) => {
                                                const next = { ...prev };
                                                delete next[inputKey(ex.id, i)];
                                                return next;
                                              })
                                            }
                                          >
                                            Cancel
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                            )}

                            {/* Add extra set */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full h-8 text-xs border-dashed gap-1"
                              onClick={() => addExtraSet(ex.id)}
                            >
                              <Plus className="h-3 w-3" />
                              Add Set
                            </Button>
                          </div>

                          {/* Client note */}
                          <div className="space-y-1.5">
                            <Label htmlFor={`client-note-${ex.id}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Your Notes
                            </Label>
                            <Textarea
                              id={`client-note-${ex.id}`}
                              placeholder="Anything you want your trainer to know about this exercise..."
                              value={clientNotes[ex.id] ?? ""}
                              onChange={(e) => handleClientNoteChange(ex.id, e.target.value)}
                              className="min-h-[64px] text-sm resize-none bg-background"
                            />
                          </div>
                        </div>
                      )}
                    </div>
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
        className="w-full"
        onClick={() => setShowEndDialog(true)}
      >
        <Trophy className="mr-2 h-4 w-4" />
        Finish Workout
      </Button>

      {/* End dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700">
              <Trophy className="h-8 w-8" />
            </div>
            <DialogTitle className="text-center text-xl">Great work!</DialogTitle>
            <p className="text-center text-sm text-muted-foreground">
              You completed {doneCount} of {totalCount} exercises.
            </p>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <Label className="font-semibold">
                How hard was this session?{" "}
                <span className="font-normal text-muted-foreground">RPE {rpe}/10</span>
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
                      i < rpe
                        ? i < 4
                          ? "bg-emerald-500"
                          : i < 7
                          ? "bg-amber-500"
                          : "bg-red-500"
                        : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Session Notes{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                placeholder="How did it feel?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            {!clientMemo ? (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">
                  Leave a voice note{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <VoiceMemoRecorder
                  workoutId={session.workout.id}
                  role="CLIENT"
                  onSuccess={(memo) => setClientMemo(memo)}
                />
              </div>
            ) : (
              <p className="text-sm font-semibold text-emerald-700">Voice note sent ✓</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowEndDialog(false)}>
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={handleFinish}
              disabled={isCompleting}
            >
              {isCompleting ? (
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
