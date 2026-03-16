import { Skeleton } from "@/components/ui/skeleton";

export default function ThreadLoading() {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-2xl mx-auto">
      <div className="flex items-center gap-3 pb-4 border-b">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="flex-1 p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
            <Skeleton className="h-12 w-48 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
