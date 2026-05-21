"use client";

import { useState } from "react";
import { WorkoutSessionTracker } from "./workout-session-tracker";
import { WorkoutChecklistTracker } from "./workout-checklist-tracker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, Zap, ChevronRight } from "lucide-react";

type Mode = "pick" | "checklist" | "session";

interface Props {
  session: any;
  initialMode?: "checklist" | "session";
}

export function WorkoutModeWrapper({ session, initialMode }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode ?? "pick");
  const [sharedCompleted, setSharedCompleted] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const log of session.exerciseLogs ?? []) {
      if (log.status === "COMPLETED") s.add(log.blockExerciseId);
    }
    return s;
  });

  function handleExerciseToggle(blockExerciseId: string, done: boolean) {
    setSharedCompleted((prev) => {
      const next = new Set(prev);
      if (done) next.add(blockExerciseId);
      else next.delete(blockExerciseId);
      return next;
    });
  }

  if (mode === "checklist") {
    return (
      <WorkoutChecklistTracker
        session={session}
        onSwitchMode={() => setMode("session")}
        additionalCompleted={sharedCompleted}
        onExerciseToggle={handleExerciseToggle}
      />
    );
  }

  if (mode === "session") {
    return (
      <WorkoutSessionTracker
        session={session}
        onSwitchMode={() => setMode("checklist")}
        additionalCompleted={sharedCompleted}
        onExerciseToggle={handleExerciseToggle}
      />
    );
  }

  // Mode picker screen
  const totalExercises = (session.workout?.blocks ?? []).reduce(
    (n: number, b: any) => n + (b.exercises?.length ?? 0),
    0
  );
  const isReturning = session.status === "IN_PROGRESS";
  const alreadyDone = sharedCompleted.size;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl bg-linear-to-br from-blue-600 via-indigo-600 to-violet-600 p-6 text-white shadow-xl shadow-blue-500/25">
        <div className="relative">
          {isReturning && (
            <Badge className="mb-3 border-white/20 bg-white/15 text-white text-xs backdrop-blur-sm">
              {alreadyDone > 0 ? `${alreadyDone} exercises done — continuing` : "In Progress"}
            </Badge>
          )}
          <h2 className="text-2xl font-bold">{session.workout?.name ?? "Workout"}</h2>
          <p className="mt-1 text-blue-200 text-sm">
            {totalExercises} exercises · How would you like to train today?
          </p>
        </div>
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMode("checklist")}
          className="group flex flex-col rounded-2xl border border-border/60 bg-card p-5 text-left shadow-sm transition-all hover:border-emerald-300 hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
            <ClipboardList className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="font-semibold text-sm">Quick Checklist</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Check off exercises as you go. Great for gym sessions.
          </p>
          <div className="mt-4 flex items-center gap-1 text-xs font-medium text-emerald-600">
            Start <ChevronRight className="h-3 w-3" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMode("session")}
          className="group flex flex-col rounded-2xl border border-border/60 bg-card p-5 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 group-hover:bg-blue-100 transition-colors">
            <Zap className="h-5 w-5 text-blue-600" />
          </div>
          <p className="font-semibold text-sm">Full Session</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Guided step-by-step with timers and set logging.
          </p>
          <div className="mt-4 flex items-center gap-1 text-xs font-medium text-blue-600">
            Start <ChevronRight className="h-3 w-3" />
          </div>
        </button>
      </div>

      {/* Overview */}
      <Card className="border-0 shadow-sm ring-1 ring-border/50">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Today&apos;s Workout</p>
          {(session.workout?.blocks ?? []).map((block: any) => (
            <div key={block.id} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
              <span className="text-sm font-medium truncate flex-1">{block.name || block.type}</span>
              {block.rounds > 1 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                  {block.rounds} rounds
                </Badge>
              )}
              <span className="text-xs text-muted-foreground shrink-0">{block.exercises?.length ?? 0} ex.</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
