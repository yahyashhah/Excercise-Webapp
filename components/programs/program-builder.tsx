"use client";

// ProgramBuilder manages the workout -> block -> exercise -> set hierarchy with DnD.
// Receives `workouts` state and `onChange` callback from ProgramEditor.

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { ExercisePickerDialog } from "./exercise-picker-dialog";
import { SetEditor } from "./set-editor";
import type {
  WorkoutInput,
  ExerciseSetInput,
} from "@/lib/validators/program";

interface Props {
  workouts: WorkoutInput[];
  onChange: (workouts: WorkoutInput[]) => void;
  exerciseLibrary: {
    id: string;
    name: string;
    bodyRegion: string;
    difficultyLevel: string;
    defaultReps?: number | null;
    musclesTargeted?: string[];
    imageUrl?: string | null;
    equipmentRequired?: string[];
  }[];
}

// Sortable wrapper for a block — must be a component so useSortable can be called as a hook.
function SortableBlock({
  id,
  children,
}: {
  id: string;
  children: (dragHandleProps: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

// Sortable wrapper for an exercise row.
function SortableExercise({
  id,
  children,
}: {
  id: string;
  children: (dragHandleProps: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

export function ProgramBuilder({ workouts, onChange, exerciseLibrary }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{
    workoutIdx: number;
    blockIdx: number;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // --- Workout operations ---
  function addWorkout() {
    const idx = workouts.length;
    onChange([
      ...workouts,
      {
        name: `Day ${idx + 1}`,
        dayIndex: idx,
        weekIndex: 0,
        orderIndex: idx,
        blocks: [
          {
            name: "Main",
            type: "NORMAL",
            orderIndex: 0,
            rounds: 1,
            exercises: [],
          },
        ],
      },
    ]);
  }

  function removeWorkout(idx: number) {
    const next = workouts
      .filter((_, i) => i !== idx)
      .map((w, i) => ({ ...w, orderIndex: i, dayIndex: i }));
    onChange(next);
  }

  function updateWorkoutField(
    idx: number,
    field: string,
    value: string | number | null
  ) {
    const next = [...workouts];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  }

  // --- Block operations ---
  function addBlock(workoutIdx: number) {
    const next = [...workouts];
    const w = next[workoutIdx];
    w.blocks = [
      ...w.blocks,
      {
        name: "New Block",
        type: "NORMAL",
        orderIndex: w.blocks.length,
        rounds: 1,
        exercises: [],
      },
    ];
    onChange(next);
  }

  function removeBlock(workoutIdx: number, blockIdx: number) {
    const next = [...workouts];
    next[workoutIdx].blocks = next[workoutIdx].blocks
      .filter((_, i) => i !== blockIdx)
      .map((b, i) => ({ ...b, orderIndex: i }));
    onChange(next);
  }

  function duplicateBlock(workoutIdx: number, blockIdx: number) {
    const next = [...workouts];
    const source = next[workoutIdx].blocks[blockIdx];

    // Deep-clone stripping all id fields so they're treated as new on save
    const clone = JSON.parse(JSON.stringify(source));
    delete clone.id;
    clone.exercises = clone.exercises.map((ex: typeof clone.exercises[number]) => {
      const { id: _eid, ...exRest } = ex as any;
      return {
        ...exRest,
        sets: exRest.sets.map((s: any) => {
          const { id: _sid, ...sRest } = s;
          return sRest;
        }),
      };
    });

    // Insert clone directly after source
    next[workoutIdx].blocks.splice(blockIdx + 1, 0, clone);

    // Reassign orderIndex for all blocks in this workout
    next[workoutIdx].blocks = next[workoutIdx].blocks.map((b, i) => ({
      ...b,
      orderIndex: i,
    }));

    onChange(next);
  }

  function duplicateExercise(workoutIdx: number, blockIdx: number, exerciseIdx: number) {
    const next = [...workouts];
    const source = next[workoutIdx].blocks[blockIdx].exercises[exerciseIdx];

    const clone = JSON.parse(JSON.stringify(source));
    const { id: _eid, ...exRest } = clone as any;
    const cloneClean = {
      ...exRest,
      sets: exRest.sets.map((s: any) => {
        const { id: _sid, ...sRest } = s;
        return sRest;
      }),
    };

    // Insert clone directly after source
    next[workoutIdx].blocks[blockIdx].exercises.splice(exerciseIdx + 1, 0, cloneClean);

    // Reassign orderIndex
    next[workoutIdx].blocks[blockIdx].exercises = next[workoutIdx].blocks[
      blockIdx
    ].exercises.map((ex, i) => ({ ...ex, orderIndex: i }));

    onChange(next);
  }

  function updateBlockField(
    workoutIdx: number,
    blockIdx: number,
    field: string,
    value: string | number | null
  ) {
    const next = [...workouts];
    next[workoutIdx].blocks[blockIdx] = {
      ...next[workoutIdx].blocks[blockIdx],
      [field]: value,
    };
    onChange(next);
  }

  // --- Exercise operations ---
  function openExercisePicker(workoutIdx: number, blockIdx: number) {
    setPickerTarget({ workoutIdx, blockIdx });
    setPickerOpen(true);
  }

  function addExerciseToBlock(exercise: Props["exerciseLibrary"][number]) {
    if (!pickerTarget) return;
    const { workoutIdx, blockIdx } = pickerTarget;
    const next = [...workouts];
    const block = next[workoutIdx].blocks[blockIdx];
    block.exercises = [
      ...block.exercises,
      {
        exerciseId: exercise.id,
        orderIndex: block.exercises.length,
        restSeconds: 60,
        notes: null,
        supersetGroup: null,
        sets: [
          {
            orderIndex: 0,
            setType: "NORMAL",
            targetReps: exercise.defaultReps || 10,
            targetWeight: null,
            targetDuration: null,
            targetDistance: null,
            targetRPE: null,
            restAfter: null,
          },
        ],
        _exerciseName: exercise.name,
        _exerciseBodyRegion: exercise.bodyRegion,
      } as WorkoutInput["blocks"][number]["exercises"][number] & {
        _exerciseName: string;
        _exerciseBodyRegion: string;
      },
    ];
    onChange(next);
    setPickerOpen(false);
  }

  function removeExercise(
    workoutIdx: number,
    blockIdx: number,
    exIdx: number
  ) {
    const next = [...workouts];
    next[workoutIdx].blocks[blockIdx].exercises = next[workoutIdx].blocks[
      blockIdx
    ].exercises
      .filter((_, i) => i !== exIdx)
      .map((e, i) => ({ ...e, orderIndex: i }));
    onChange(next);
  }

  function updateExerciseSets(
    workoutIdx: number,
    blockIdx: number,
    exIdx: number,
    sets: ExerciseSetInput[]
  ) {
    const next = [...workouts];
    next[workoutIdx].blocks[blockIdx].exercises[exIdx].sets = sets;
    onChange(next);
  }

  function updateExerciseNotes(
    workoutIdx: number,
    blockIdx: number,
    exIdx: number,
    notes: string
  ) {
    const next = [...workouts];
    next[workoutIdx].blocks[blockIdx].exercises[exIdx] = {
      ...next[workoutIdx].blocks[blockIdx].exercises[exIdx],
      notes: notes || null,
    };
    onChange(next);
  }

  // --- DnD for blocks within a workout ---
  function handleBlockDragEnd(workoutIdx: number, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const next = [...workouts];
    const blocks = next[workoutIdx].blocks;
    const oldIdx = blocks.findIndex(
      (b) => `block-${workoutIdx}-${b.orderIndex}` === active.id
    );
    const newIdx = blocks.findIndex(
      (b) => `block-${workoutIdx}-${b.orderIndex}` === over.id
    );

    if (oldIdx !== -1 && newIdx !== -1) {
      next[workoutIdx].blocks = arrayMove(blocks, oldIdx, newIdx).map(
        (b, i) => ({ ...b, orderIndex: i })
      );
      onChange(next);
    }
  }

  // --- DnD for exercises within a block ---
  function handleExerciseDragEnd(
    workoutIdx: number,
    blockIdx: number,
    event: DragEndEvent
  ) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const next = [...workouts];
    const exercises = next[workoutIdx].blocks[blockIdx].exercises;
    const oldIdx = exercises.findIndex(
      (e) => `ex-${workoutIdx}-${blockIdx}-${e.orderIndex}` === active.id
    );
    const newIdx = exercises.findIndex(
      (e) => `ex-${workoutIdx}-${blockIdx}-${e.orderIndex}` === over.id
    );

    if (oldIdx !== -1 && newIdx !== -1) {
      next[workoutIdx].blocks[blockIdx].exercises = arrayMove(
        exercises,
        oldIdx,
        newIdx
      ).map((e, i) => ({ ...e, orderIndex: i }));
      onChange(next);
    }
  }

  // --- Look up exercise name from library ---
  function getExerciseName(exerciseId: string, fallback?: string): string {
    const ex = exerciseLibrary.find((e) => e.id === exerciseId);
    return ex?.name || fallback || "Unknown Exercise";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-card p-4 rounded-lg border">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Workouts</h2>
          <p className="text-sm text-muted-foreground">
            Build your program&apos;s workout structure. Drag blocks or exercises to reorder.
          </p>
        </div>
      </div>

      {workouts.map((workout, wi) => (
        <Card key={wi} className="border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-3 flex-1">
              <Input
                value={workout.name}
                onChange={(e) =>
                  updateWorkoutField(wi, "name", e.target.value)
                }
                className="text-lg font-bold max-w-xs"
              />
              <Input
                type="number"
                value={workout.estimatedMinutes ?? ""}
                onChange={(e) =>
                  updateWorkoutField(
                    wi,
                    "estimatedMinutes",
                    e.target.value ? parseInt(e.target.value) : null
                  )
                }
                placeholder="Est. min"
                className="w-24"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeWorkout(wi)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleBlockDragEnd(wi, e)}
            >
              <SortableContext
                items={workout.blocks.map(
                  (b) => `block-${wi}-${b.orderIndex}`
                )}
                strategy={verticalListSortingStrategy}
              >
                {workout.blocks.map((block, bi) => (
                  <SortableBlock key={bi} id={`block-${wi}-${block.orderIndex}`}>
                    {(dragHandleProps) => (
                      <div className="border rounded-lg p-4 bg-muted/30">
                        {/* Block header */}
                        <div className="flex items-center gap-3 mb-3">
                          <button
                            type="button"
                            className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
                            {...dragHandleProps}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <Input
                            value={block.name || ""}
                            onChange={(e) =>
                              updateBlockField(wi, bi, "name", e.target.value)
                            }
                            placeholder="Block name"
                            className="max-w-[200px]"
                          />
                          <Select
                            value={block.type}
                            onValueChange={(v) =>
                              updateBlockField(wi, bi, "type", v)
                            }
                          >
                            <SelectTrigger className="w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NORMAL">Normal</SelectItem>
                              <SelectItem value="WARMUP">Warmup</SelectItem>
                              <SelectItem value="COOLDOWN">Cooldown</SelectItem>
                              <SelectItem value="SUPERSET">Superset</SelectItem>
                              <SelectItem value="CIRCUIT">Circuit</SelectItem>
                              <SelectItem value="AMRAP">AMRAP</SelectItem>
                              <SelectItem value="EMOM">EMOM</SelectItem>
                            </SelectContent>
                          </Select>
                          {(block.type === "CIRCUIT" ||
                            block.type === "AMRAP") && (
                            <Input
                              type="number"
                              value={block.rounds}
                              onChange={(e) =>
                                updateBlockField(
                                  wi,
                                  bi,
                                  "rounds",
                                  parseInt(e.target.value) || 1
                                )
                              }
                              className="w-20"
                              min={1}
                              placeholder="Rounds"
                            />
                          )}
                          {block.type === "AMRAP" && (
                            <Input
                              type="number"
                              value={block.timeCap ?? ""}
                              onChange={(e) =>
                                updateBlockField(
                                  wi,
                                  bi,
                                  "timeCap",
                                  e.target.value
                                    ? parseInt(e.target.value)
                                    : null
                                )
                              }
                              className="w-24"
                              placeholder="Time cap (s)"
                            />
                          )}
                          <div className="ml-auto flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => duplicateBlock(wi, bi)}
                              className="text-muted-foreground hover:text-foreground h-8 w-8"
                              title="Duplicate block"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeBlock(wi, bi)}
                              className="text-destructive h-8 w-8"
                              title="Remove block"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Exercises in this block */}
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(e) => handleExerciseDragEnd(wi, bi, e)}
                        >
                          <SortableContext
                            items={block.exercises.map(
                              (e) => `ex-${wi}-${bi}-${e.orderIndex}`
                            )}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {block.exercises.map((ex, ei) => (
                                <SortableExercise
                                  key={ei}
                                  id={`ex-${wi}-${bi}-${ex.orderIndex}`}
                                >
                                  {(exDragHandleProps) => (
                                    <div className="border rounded-md p-3 bg-background">
                                      <div className="flex items-center gap-2 mb-2">
                                        <button
                                          type="button"
                                          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
                                          {...exDragHandleProps}
                                        >
                                          <GripVertical className="h-4 w-4" />
                                        </button>
                                        <span className="font-medium flex-1">
                                          {getExerciseName(
                                            ex.exerciseId,
                                            (
                                              ex as typeof ex & {
                                                _exerciseName?: string;
                                              }
                                            )._exerciseName
                                          )}
                                        </span>
                                        <div className="flex items-center gap-0.5">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => duplicateExercise(wi, bi, ei)}
                                            className="text-muted-foreground hover:text-foreground h-7 w-7"
                                            title="Duplicate exercise"
                                          >
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() =>
                                              removeExercise(wi, bi, ei)
                                            }
                                            className="text-destructive h-7 w-7"
                                            title="Remove exercise"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                      {/* Clinician notes for this exercise */}
                                      <Textarea
                                        value={ex.notes ?? ""}
                                        onChange={(e) =>
                                          updateExerciseNotes(
                                            wi,
                                            bi,
                                            ei,
                                            e.target.value
                                          )
                                        }
                                        placeholder="Instructions for client (e.g. use one hand only, keep back straight)…"
                                        className="text-sm mb-2 min-h-[36px] resize-none"
                                        rows={1}
                                      />
                                      <SetEditor
                                        sets={ex.sets}
                                        onChange={(sets) =>
                                          updateExerciseSets(wi, bi, ei, sets)
                                        }
                                      />
                                    </div>
                                  )}
                                </SortableExercise>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>

                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => openExercisePicker(wi, bi)}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" /> Add Exercise
                        </Button>
                      </div>
                    )}
                  </SortableBlock>
                ))}
              </SortableContext>
            </DndContext>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => addBlock(wi)}
              className="w-full border-dashed border-2"
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Block
            </Button>
          </CardContent>
        </Card>
      ))}

      <Button
        variant="secondary"
        onClick={addWorkout}
        className="w-full border-dashed border-2 bg-background hover:bg-muted"
      >
        <Plus className="mr-2 h-4 w-4" /> Add Workout Day
      </Button>

      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        exercises={exerciseLibrary}
        onSelect={addExerciseToBlock}
      />
    </div>
  );
}
