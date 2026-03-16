"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPlanAction as saveWorkoutPlan } from "@/actions/workout-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MedicalDisclaimer } from "@/components/shared/medical-disclaimer";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save, RefreshCw } from "lucide-react";
import { ROUTES } from "@/lib/utils/constants";
import type { GeneratedWorkout } from "@/lib/ai/schemas/workout-output";

interface AIStreamPreviewProps {
  workout: GeneratedWorkout | null;
  isGenerating: boolean;
  patientId: string;
  onRegenerate: () => void;
}

export function AIStreamPreview({
  workout,
  isGenerating,
  patientId,
  onRegenerate,
}: AIStreamPreviewProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  if (isGenerating) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            AI is selecting exercises...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!workout) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await saveWorkoutPlan({
        patientId,
        title: workout.title,
        description: workout.description,
        durationMinutes: workout.durationMinutes,
        daysPerWeek: workout.daysPerWeek,
        exercises: workout.exercises.map((ex) => ({
          exerciseId: ex.exerciseId,
          dayOfWeek: ex.dayOfWeek ?? undefined,
          orderIndex: ex.orderIndex,
          sets: ex.sets,
          reps: ex.reps ?? undefined,
          durationSeconds: ex.durationSeconds ?? undefined,
          restSeconds: ex.restSeconds ?? undefined,
          notes: ex.rationale,
        })),
        
      });

      if (result.success) {
        toast.success("Workout plan saved successfully");
        router.push(ROUTES.WORKOUT_PLANS);
      } else {
        toast.error(result.error ?? "Failed to save plan");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <MedicalDisclaimer />

      <Card>
        <CardHeader>
          <CardTitle>{workout.title}</CardTitle>
          <p className="text-muted-foreground text-sm">{workout.description}</p>
          <div className="flex gap-2 mt-2">
            <Badge variant="outline">{workout.durationMinutes} min</Badge>
            <Badge variant="outline">{workout.daysPerWeek} days/week</Badge>
            <Badge variant="outline">{workout.exercises.length} exercises</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {workout.exercises.map((exercise, i) => (
              <div
                key={`${exercise.exerciseId}-${i}`}
                className="flex items-start gap-3 p-3 rounded-md border"
              >
                <div className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{exercise.exerciseName}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <span className="text-muted-foreground text-xs">
                      {exercise.sets} sets
                    </span>
                    {exercise.reps && (
                      <span className="text-muted-foreground text-xs">
                        x {exercise.reps} reps
                      </span>
                    )}
                    {exercise.durationSeconds && (
                      <span className="text-muted-foreground text-xs">
                        {exercise.durationSeconds}s hold
                      </span>
                    )}
                    <span className="text-muted-foreground text-xs">
                      {exercise.restSeconds}s rest
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs mt-1 italic">
                    {exercise.rationale}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {workout.overallRationale && (
            <div className="mt-4 p-3 bg-muted rounded-md">
              <p className="text-sm font-medium mb-1">Overall Rationale</p>
              <p className="text-muted-foreground text-sm">
                {workout.overallRationale.substring(0, 500)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={onRegenerate}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Regenerate
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Plan
        </Button>
      </div>
    </div>
  );
}
