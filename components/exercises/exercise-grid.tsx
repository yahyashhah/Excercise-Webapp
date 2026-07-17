"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExerciseCard } from "@/components/exercises/exercise-card";
import { Button } from "@/components/ui/button";
import { adoptUniversalExercisesAction } from "@/actions/exercise-actions";
import type { getExercises } from "@/lib/services/exercise.service";
import { Plus, X, Loader2 } from "lucide-react";

type ExerciseListItem = Awaited<ReturnType<typeof getExercises>>[number];

interface ExerciseGridProps {
  exercises: ExerciseListItem[];
  activeSource: "UNIVERSAL" | "ORGANIZATION";
  organizationOrgId?: string;
}

export function ExerciseGrid({ exercises, activeSource, organizationOrgId }: ExerciseGridProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const canAdopt = activeSource === "UNIVERSAL" && !!organizationOrgId;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleAdoptSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    startTransition(async () => {
      const result = await adoptUniversalExercisesAction(ids);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const { successCount, failures } = result;
      if (failures.length === 0) {
        toast.success(
          `Added ${successCount} exercise${successCount !== 1 ? "s" : ""} to your organization`
        );
      } else if (successCount > 0) {
        toast.warning(
          `Added ${successCount} of ${ids.length} exercises — ${failures.length} could not be added`
        );
      } else {
        toast.error("Could not add the selected exercises");
      }

      clearSelection();
      if (successCount > 0) {
        router.push("/exercises?source=ORGANIZATION");
      }
    });
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            id={exercise.id}
            name={exercise.name}
            bodyRegion={exercise.bodyRegion}
            difficultyLevel={exercise.difficultyLevel}
            exercisePhases={exercise.exercisePhases}
            equipmentRequired={exercise.equipmentRequired}
            description={exercise.description}
            imageUrl={exercise.imageUrl}
            videoUrl={exercise.videoUrl}
            isActive={exercise.isActive}
            isTrainer
            source={exercise.source}
            isPublic={exercise.isPublic}
            organizationId={exercise.organizationId}
            organizationOrganizationId={organizationOrgId}
            canAdopt={canAdopt}
            selected={selectedIds.has(exercise.id)}
            onToggleSelect={canAdopt ? () => toggleSelect(exercise.id) : undefined}
          />
        ))}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2 shadow-lg backdrop-blur">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button size="sm" onClick={handleAdoptSelected} disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              Add {selectedIds.size} to My Organization
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection} disabled={isPending}>
              <X className="mr-1.5 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
