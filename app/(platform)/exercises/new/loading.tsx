import { CardSkeleton } from "@/components/shared/loading-skeleton";

export default function ExerciseNewLoading() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
