import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { ExerciseCard } from "@/components/exercises/exercise-card";
import { ExerciseFilters } from "@/components/exercises/exercise-filters";
import { Button } from "@/components/ui/button";
import { Dumbbell, Plus } from "lucide-react";
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

  const hasFilters = params.search || params.bodyRegion || params.difficultyLevel;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Exercise Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {exercises.length} exercise{exercises.length !== 1 ? "s" : ""} available
          </p>
        </div>
        {user.role === "CLINICIAN" && (
          <Button asChild className="shrink-0">
            <Link href="/exercises/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Exercise
            </Link>
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-xs">
        <Suspense fallback={null}>
          <ExerciseFilters />
        </Suspense>
      </div>

      {/* Results */}
      {exercises.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Dumbbell className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <h3 className="mt-4 text-base font-semibold">
            {hasFilters ? "No exercises match your filters" : "No exercises yet"}
          </h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {hasFilters
              ? "Try adjusting your search or filter criteria."
              : "The exercise library is empty. Add your first exercise to get started."}
          </p>
          {user.role === "CLINICIAN" && !hasFilters && (
            <Button className="mt-5" asChild>
              <Link href="/exercises/new">
                <Plus className="mr-2 h-4 w-4" />
                Add First Exercise
              </Link>
            </Button>
          )}
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
