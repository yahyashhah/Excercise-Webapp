"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updatePlanExerciseAction as updatePlanExercise } from "@/actions/workout-actions";
import { ExerciseSlot } from "./exercise-slot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import type { WorkoutPlan, PlanExercise, Exercise } from "@prisma/client";

interface WorkoutPlanEditorProps {
  plan: WorkoutPlan & {
    exercises: Array<PlanExercise & { exercise: Exercise }>;
  };
}

export function WorkoutPlanEditor({ plan }: WorkoutPlanEditorProps) {
  const [exercises, setExercises] = useState(
    plan.exercises.filter((e) => e.isActive).sort((a, b) => a.orderIndex - b.orderIndex)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, Partial<{ sets: number; reps: number }>>
  >(new Map());

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newExercises = [...exercises];
    [newExercises[index - 1], newExercises[index]] = [
      newExercises[index],
      newExercises[index - 1],
    ];
    newExercises.forEach((ex, i) => {
      ex.orderIndex = i;
    });
    setExercises(newExercises);
  };

  const handleMoveDown = (index: number) => {
    if (index === exercises.length - 1) return;
    const newExercises = [...exercises];
    [newExercises[index], newExercises[index + 1]] = [
      newExercises[index + 1],
      newExercises[index],
    ];
    newExercises.forEach((ex, i) => {
      ex.orderIndex = i;
    });
    setExercises(newExercises);
  };

  const handleRemove = async (planExerciseId: string) => {
    const result = await updatePlanExercise(planExerciseId, { isActive: false });
    if (result.success) {
      setExercises((prev) => prev.filter((e) => e.id !== planExerciseId));
      toast.success("Exercise removed");
    } else {
      toast.error(result.error ?? "Failed to remove exercise");
    }
  };

  const handleUpdateSets = (id: string, sets: number) => {
    setPendingChanges((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(id) ?? {};
      updated.set(id, { ...existing, sets });
      return updated;
    });
  };

  const handleUpdateReps = (id: string, reps: number) => {
    setPendingChanges((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(id) ?? {};
      updated.set(id, { ...existing, reps });
      return updated;
    });
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      // Save order changes
      for (const ex of exercises) {
        const changes = pendingChanges.get(ex.id);
        await updatePlanExercise(ex.id, {
          orderIndex: ex.orderIndex,
          ...(changes?.sets !== undefined ? { sets: changes.sets } : {}),
          ...(changes?.reps !== undefined ? { reps: changes.reps } : {}),
        });
      }
      setPendingChanges(new Map());
      toast.success("Changes saved successfully");
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Edit Exercises</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {exercises.map((pe, index) => (
            <ExerciseSlot
              key={pe.id}
              planExercise={pe}
              mode="edit"
              onMoveUp={() => handleMoveUp(index)}
              onMoveDown={() => handleMoveDown(index)}
              onRemove={() => handleRemove(pe.id)}
              onUpdateSets={(sets) => handleUpdateSets(pe.id, sets)}
              onUpdateReps={(reps) => handleUpdateReps(pe.id, reps)}
            />
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSaveAll} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
