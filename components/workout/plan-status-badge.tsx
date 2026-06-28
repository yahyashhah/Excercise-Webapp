import { Badge } from "@/components/ui/badge";
import { formatPlanStatus } from "@/lib/utils/formatting";

const statusColors: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-green-100 text-green-700",
  PAUSED: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  ARCHIVED: "bg-muted text-muted-foreground/60",
};

export function PlanStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={statusColors[status] || ""} variant="secondary">
      {formatPlanStatus(status)}
    </Badge>
  );
}
