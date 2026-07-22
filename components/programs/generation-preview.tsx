"use client";

import { Loader2, CircleCheck, Wrench, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PreviewExercise {
  exerciseName?: string;
  phase?: string;
  sets?: number;
  reps?: number | null;
  durationSeconds?: number | null;
  dayOfWeek?: number;
}

export interface PreviewWeek {
  weekIndex: number;
  title: string;
  sessions: { dayOfWeek: number; name: string }[];
  exercises: PreviewExercise[];
}

export type WeekStatus = "pending" | "generating" | "validating" | "repairing" | "ready";

export interface UnfilledSlotView {
  weekIndex: number;
  dayOfWeek: number;
  phase: string;
  reason: string;
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_CHIP: Record<WeekStatus, { label: string; className: string }> = {
  pending: { label: "Queued", className: "bg-muted text-muted-foreground" },
  generating: { label: "Generating…", className: "bg-primary/10 text-primary" },
  validating: { label: "Validating…", className: "bg-amber-100 text-amber-700" },
  repairing: { label: "Fixing issues…", className: "bg-amber-100 text-amber-700" },
  ready: { label: "Ready", className: "bg-emerald-100 text-emerald-700" },
};

export function GenerationPreview({
  weeks,
  statuses,
  unfilled,
  onCancel,
  cancelling,
}: {
  weeks: PreviewWeek[];
  statuses: Record<number, WeekStatus>;
  unfilled: UnfilledSlotView[];
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Building your program…</h3>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={cancelling}>
          <X className="mr-1.5 h-3.5 w-3.5" />
          {cancelling ? "Stopping…" : "Cancel"}
        </Button>
      </div>

      {weeks.map((week) => {
        const status = statuses[week.weekIndex] ?? "pending";
        const chip = STATUS_CHIP[status];
        const weekUnfilled = unfilled.filter((u) => u.weekIndex === week.weekIndex);
        return (
          <div key={week.weekIndex} className="rounded-xl border border-border/60 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Week {week.weekIndex + 1}
                {week.title ? ` — ${week.title}` : ""}
              </p>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${chip.className}`}
              >
                {status === "generating" && <Loader2 className="h-3 w-3 animate-spin" />}
                {status === "validating" && <Loader2 className="h-3 w-3 animate-spin" />}
                {status === "repairing" && <Wrench className="h-3 w-3" />}
                {status === "ready" && <CircleCheck className="h-3 w-3" />}
                {chip.label}
              </span>
            </div>

            {week.exercises.length > 0 && (
              <div className="mt-3 space-y-1">
                {week.exercises.map((ex, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-9 shrink-0 font-medium">
                      {ex.dayOfWeek != null ? WEEKDAY_NAMES[ex.dayOfWeek] : ""}
                    </span>
                    <span className="truncate">{ex.exerciseName ?? "…"}</span>
                    <span className="ml-auto shrink-0">
                      {ex.sets ?? "–"}×
                      {ex.reps != null ? ex.reps : ex.durationSeconds != null ? `${ex.durationSeconds}s` : "–"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {weekUnfilled.length > 0 && (
              <div className="mt-3 space-y-1">
                {weekUnfilled.map((slot, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    Couldn&apos;t fill: {slot.phase.toLowerCase()} slot on{" "}
                    {WEEKDAY_NAMES[slot.dayOfWeek]} — add one manually after saving.
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
