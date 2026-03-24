import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { ExerciseCard } from "@/components/exercises/exercise-card";
import { ExerciseFilters } from "@/components/exercises/exercise-filters";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { BodyRegion, DifficultyLevel } from "@prisma/client";

interface Props {
  searchParams: Promise<{
    search?: string;
    bodyRegion?: string;
    difficultyLevel?: string;
    equipment?: string;
  }>;
}

export default async function ExercisesPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  const params = await searchParams;

  const exercises = await getExercises({
    search: params.search,
    bodyRegion: params.bodyRegion as BodyRegion | undefined,
    difficultyLevel: params.difficultyLevel as DifficultyLevel | undefined,
    equipment: params.equipment,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Exercise Library</h2>
          <p className="text-slate-600">{exercises.length} exercises available</p>
        </div>
        {user.role === "CLINICIAN" && (
          <Button asChild>
            <Link href="/exercises/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Exercise
            </Link>
          </Button>
        )}
      </div>

      <Suspense fallback={null}>
        <ExerciseFilters />
      </Suspense>

      {exercises.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center">
          <p className="text-slate-500">No exercises found matching your filters.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {exercises.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              id={exercise.id}
              name={exercise.name}
              bodyRegion={exercise.bodyRegion}
              difficultyLevel={exercise.difficultyLevel}
              exercisePhase={exercise.exercisePhase}
              equipmentRequired={exercise.equipmentRequired}
              description={exercise.description}
              imageUrl={exercise.imageUrl}
              videoUrl={exercise.videoUrl}
              isActive={exercise.isActive}
              isClinician={user.role === "CLINICIAN"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
