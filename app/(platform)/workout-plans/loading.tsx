import { GridSkeleton } from "@/components/shared/loading-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function WorkoutPlansLoading() {
  return (
    <div>
      <div className="flex items-center justify-between pb-6">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <GridSkeleton count={6} />
    </div>
  );
}
