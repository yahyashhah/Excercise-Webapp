import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { PlanStatusBadge } from "./plan-status-badge";
import { formatDate } from "@/lib/utils/formatting";
import { ClipboardList } from "lucide-react";

interface PlanCardProps {
  id: string;
  title: string;
  status: string;
  description?: string | null;
  exerciseCount: number;
  sessionCount: number;
  patientName?: string;
  updatedAt: Date;
}

export function PlanCard({
  id,
  title,
  status,
  description,
  exerciseCount,
  sessionCount,
  patientName,
  updatedAt,
}: PlanCardProps) {
  return (
    <Link href={`/workout-plans/${id}`}>
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="p-5">
          <div className="mb-3 flex items-start justify-between">
            <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
              <ClipboardList className="h-5 w-5" />
            </div>
            <PlanStatusBadge status={status} />
          </div>
          <h3 className="mb-1 font-semibold text-slate-900">{title}</h3>
          {patientName && (
            <p className="text-sm text-blue-600">{patientName}</p>
          )}
          {description && (
            <p className="mb-3 mt-1 line-clamp-2 text-sm text-slate-500">{description}</p>
          )}
          <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
            <span>{exerciseCount} exercises</span>
            <span>{sessionCount} sessions</span>
            <span>Updated {formatDate(updatedAt)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
