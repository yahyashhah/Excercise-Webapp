import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { ExerciseCard } from "@/components/exercises/exercise-card";
import { ExerciseFilters } from "@/components/exercises/exercise-filters";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Dumbbell } from "lucide-react";
import type { BodyRegion, DifficultyLevel, ExercisePhase } from "@prisma/client";

interface Props {
  searchParams: Promise<{
    search?: string;
    bodyRegion?: string;
    difficultyLevel?: string;
    exercisePhase?: string;
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
    exercisePhase: params.exercisePhase as ExercisePhase | undefined,
    equipment: params.equipment,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Exercise Library</h2>
          <p className="text-muted-foreground">{exercises.length} exercises available</p>
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

      <Suspense fallback={<Skeleton className="h-10 w-full max-w-lg" />}>
        <ExerciseFilters />
      </Suspense>

      {exercises.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Dumbbell className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-4 font-semibold">No exercises found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your filters, or add a new exercise to the library.
          </p>
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
