import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ---------- Types derived from the Prisma query ----------

type SessionWithRelations = NonNullable<
  Awaited<ReturnType<typeof fetchSession>>
>;
type Block = SessionWithRelations["workout"]["blocks"][number];
type BlockExercise = Block["exercises"][number];
type ExerciseSet = BlockExercise["sets"][number];
type ExerciseLog = SessionWithRelations["exerciseLogs"][number];
type SetLog = ExerciseLog["setLogs"][number];

// ---------- Constants ----------

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-emerald-100 text-emerald-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  SCHEDULED: "bg-blue-100 text-blue-700",
  MISSED: "bg-red-100 text-red-700",
  SKIPPED: "bg-slate-100 text-slate-600",
};

const CIRCUIT_TYPES = new Set(["CIRCUIT", "SUPERSET", "WARMUP", "COOLDOWN"]);

// ---------- Helpers ----------

function isCircuitBlock(type: string): boolean {
  return CIRCUIT_TYPES.has(type.toUpperCase());
}

function getSetCount(block: Block, exercise: BlockExercise): number {
  return isCircuitBlock(block.type)
    ? Math.max(1, block.rounds ?? 1)
    : exercise.sets.length;
}

function getStatusColor(status: string): string {
  return STATUS_COLORS[status.toUpperCase()] ?? "bg-slate-100 text-slate-600";
}

function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

function isCouldntComplete(log: SetLog): boolean {
  return log.actualReps === 0 && log.actualDuration == null;
}

function getExerciseCompletion(
  setCount: number,
  setLogs: SetLog[]
): "all" | "partial" | "none" {
  if (setLogs.length === 0) return "none";
  if (setLogs.length >= setCount) return "all";
  return "partial";
}

// ---------- Data fetching ----------

async function fetchSession(sessionId: string) {
  return prisma.workoutSessionV2.findUnique({
    where: { id: sessionId },
    include: {
      patient: { select: { firstName: true, lastName: true } },
      workout: {
        include: {
          program: { select: { clinicianId: true, name: true } },
          blocks: {
            orderBy: { orderIndex: "asc" },
            include: {
              exercises: {
                orderBy: { orderIndex: "asc" },
                include: {
                  exercise: { select: { name: true } },
                  sets: { orderBy: { orderIndex: "asc" } },
                },
              },
            },
          },
        },
      },
      exerciseLogs: {
        include: { setLogs: true },
      },
    },
  });
}

// ---------- Page ----------

interface Props {
  params: Promise<{ id: string; sessionId: string }>;
}

export default async function SessionReviewPage({ params }: Props) {
  const { id, sessionId } = await params;
  const user = await requireRole("CLINICIAN");

  const session = await fetchSession(sessionId);
  if (!session) notFound();

  // Authorization: session must belong to this patient AND this clinician must
  // own the program. Either failure → 404 (avoid leaking existence).
  if (session.patientId !== id) notFound();
  if (session.workout.program.clinicianId !== user.id) notFound();

  // Build a lookup from blockExerciseId → setLogs for O(1) access in render.
  const setLogsByBlockExerciseId = new Map<string, SetLog[]>();
  for (const log of session.exerciseLogs) {
    setLogsByBlockExerciseId.set(
      log.blockExerciseId,
      [...log.setLogs].sort((a, b) => a.setIndex - b.setIndex)
    );
  }

  // Summary stats
  const totalExercises = session.workout.blocks.reduce(
    (acc, b) => acc + b.exercises.length,
    0
  );
  const allSetLogs = session.exerciseLogs.flatMap((l) => l.setLogs);
  const setsLogged = allSetLogs.length;
  const couldntComplete = allSetLogs.filter(isCouldntComplete).length;

  const patientName = `${session.patient.firstName} ${session.patient.lastName}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/patients/${id}/adherence`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      {/* Session header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">
            {session.workout.name}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{patientName}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {format(session.scheduledDate, "MMM d, yyyy")}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(
                session.status
              )}`}
            >
              {formatStatus(session.status)}
            </span>
            {session.overallRPE != null && (
              <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                RPE {session.overallRPE}
              </span>
            )}
            {session.durationMinutes != null && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {session.durationMinutes} min
              </span>
            )}
          </div>

          {session.overallNotes && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Notes: </span>
              {session.overallNotes}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="flex flex-wrap gap-3">
        <StatChip label="Exercises" value={totalExercises} />
        <StatChip label="Sets logged" value={setsLogged} />
        <StatChip
          label="Couldn't complete"
          value={couldntComplete}
          tone={couldntComplete > 0 ? "amber" : "neutral"}
        />
        <StatChip label="Overall RPE" value={session.overallRPE ?? "—"} />
      </div>

      {/* Blocks */}
      <div className="space-y-6">
        {session.workout.blocks.map((block) => (
          <section key={block.id} className="space-y-3">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {block.name || block.type}
              </h3>
              {isCircuitBlock(block.type) && (
                <span className="text-xs text-muted-foreground">
                  · {block.rounds ?? 1} rounds
                </span>
              )}
            </div>

            <div className="space-y-4">
              {block.exercises.map((exercise) => {
                const setCount = getSetCount(block, exercise);
                const setLogs =
                  setLogsByBlockExerciseId.get(exercise.id) ?? [];
                const completion = getExerciseCompletion(setCount, setLogs);

                return (
                  <Card key={exercise.id}>
                    <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
                      <CardTitle className="text-base font-semibold">
                        {exercise.exercise.name}
                      </CardTitle>
                      <CompletionBadge completion={completion} />
                    </CardHeader>
                    <CardContent className="p-0">
                      <SetTable
                        block={block}
                        exercise={exercise}
                        setCount={setCount}
                        setLogs={setLogs}
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function StatChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "amber";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-muted text-foreground ring-border";

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ${toneClass}`}
    >
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function CompletionBadge({
  completion,
}: {
  completion: "all" | "partial" | "none";
}) {
  if (completion === "all") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
        All done
      </span>
    );
  }
  if (completion === "partial") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        Partial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
      Not started
    </span>
  );
}

function SetTable({
  block,
  exercise,
  setCount,
  setLogs,
}: {
  block: Block;
  exercise: BlockExercise;
  setCount: number;
  setLogs: SetLog[];
}) {
  const isCircuit = isCircuitBlock(block.type);
  const indexLabel = isCircuit ? "Round" : "Set";

  // Map setLogs by setIndex for O(1) lookup. setIndex is 0-based.
  const logByIndex = new Map<number, SetLog>();
  for (const log of setLogs) logByIndex.set(log.setIndex, log);

  // Build rows for indices 0..setCount-1
  const rows = Array.from({ length: setCount }, (_, i) => {
    const exerciseSet: ExerciseSet | undefined = exercise.sets[i];
    const log = logByIndex.get(i);
    return { index: i, exerciseSet, log };
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">#</th>
            <th className="px-3 py-2 text-left font-medium">Target</th>
            <th className="px-3 py-2 text-left font-medium">Actual</th>
            <th className="px-3 py-2 text-left font-medium">Weight</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ index, exerciseSet, log }) => (
            <SetRow
              key={index}
              indexLabel={indexLabel}
              displayIndex={index + 1}
              exerciseSet={exerciseSet}
              log={log}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SetRow({
  indexLabel,
  displayIndex,
  exerciseSet,
  log,
}: {
  indexLabel: string;
  displayIndex: number;
  exerciseSet: ExerciseSet | undefined;
  log: SetLog | undefined;
}) {
  // ---- Target column ----
  const targetText = exerciseSet
    ? exerciseSet.targetReps != null
      ? `${exerciseSet.targetReps} reps`
      : exerciseSet.targetDuration != null
      ? `${exerciseSet.targetDuration}s`
      : "—"
    : "—";

  // ---- Actual column ----
  let actualText = "—";
  if (log) {
    if (log.actualReps != null && log.actualReps > 0) {
      actualText = String(log.actualReps);
    } else if (log.actualDuration != null) {
      actualText = `${log.actualDuration}s`;
    } else if (log.actualReps === 0) {
      actualText = "0";
    }
  }

  // ---- Weight column ----
  const weightText =
    log && log.actualWeight != null ? `${log.actualWeight} lbs` : "—";

  // ---- Status badge ----
  let statusBadge: React.ReactNode;
  let noteText: string | null = null;
  if (!log) {
    statusBadge = (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        ○ Not logged
      </span>
    );
  } else if (isCouldntComplete(log)) {
    statusBadge = (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        ⚠ Couldn&apos;t complete
      </span>
    );
    if (log.notes) noteText = log.notes;
  } else {
    statusBadge = (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        ✓ Done
      </span>
    );
  }

  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-2 font-medium text-foreground">
        {indexLabel} {displayIndex}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{targetText}</td>
      <td className="px-3 py-2 text-foreground">{actualText}</td>
      <td className="px-3 py-2 text-muted-foreground">{weightText}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          {statusBadge}
          {noteText && (
            <span className="text-xs text-muted-foreground">{noteText}</span>
          )}
        </div>
      </td>
    </tr>
  );
}
