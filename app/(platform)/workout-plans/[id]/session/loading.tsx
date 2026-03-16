import { CardSkeleton } from "@/components/shared/loading-skeleton";

export default function SessionLoading() {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      <div className="h-4 w-full bg-muted animate-pulse rounded" />
      <CardSkeleton />
    </div>
  );
}
