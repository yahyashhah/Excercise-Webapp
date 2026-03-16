import { Skeleton } from "@/components/ui/skeleton";

export default function MessagesLoading() {
  return (
    <div>
      <div className="pb-6">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-48 mt-2" />
      </div>
      <div className="space-y-2 max-w-2xl">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4 border rounded-md">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
