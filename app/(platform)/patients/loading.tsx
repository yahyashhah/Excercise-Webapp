import { GridSkeleton } from "@/components/shared/loading-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function PatientsLoading() {
  return (
    <div>
      <div className="flex items-center justify-between pb-6">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <GridSkeleton count={3} />
    </div>
  );
}
