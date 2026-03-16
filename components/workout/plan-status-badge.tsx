import { Badge } from "@/components/ui/badge";
import { formatPlanStatus } from "@/lib/utils/formatting";

const statusColors: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  ACTIVE: "bg-green-100 text-green-700",
  PAUSED: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  ARCHIVED: "bg-slate-100 text-slate-500",
};

export function PlanStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={statusColors[status] || ""} variant="secondary">
      {formatPlanStatus(status)}
    </Badge>
  );
}
