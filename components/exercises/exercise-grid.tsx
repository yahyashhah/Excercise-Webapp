import { ExerciseCard } from "./exercise-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Dumbbell } from "lucide-react";
import type { Exercise } from "@prisma/client";

interface ExerciseGridProps {
  exercises: Exercise[];
}

export function ExerciseGrid({ exercises }: ExerciseGridProps) {
  if (exercises.length === 0) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="No exercises found"
        description="Try adjusting your search filters or add a new exercise."
      />
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {exercises.map((exercise) => (
        <ExerciseCard
            key={exercise.id}
            id={exercise.id}
            name={exercise.name}
            bodyRegion={exercise.bodyRegion}
            difficultyLevel={exercise.difficultyLevel}
            equipmentRequired={exercise.equipmentRequired}
            description={exercise.description}
          />
      ))}
    </div>
  );
}
