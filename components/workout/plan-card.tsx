import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { PlanStatusBadge } from "./plan-status-badge";
import { formatDate } from "@/lib/utils/formatting";
import { ClipboardList, Dumbbell, Calendar, User } from "lucide-react";

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
    <Link href={`/workout-plans/${id}`} className="group block h-full">
      <Card className="h-full border-border/60 transition-all duration-200 hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5">
        <CardContent className="flex h-full flex-col p-5">
          {/* Header row */}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary ring-1 ring-primary/10">
              <ClipboardList className="h-5 w-5" />
            </div>
            <PlanStatusBadge status={status} />
          </div>

          {/* Title */}
          <h3 className="mb-1 font-semibold text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
            {title}
          </h3>

          {/* Patient */}
          {patientName && (
            <div className="mb-1 flex items-center gap-1.5 text-sm text-primary font-medium">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{patientName}</span>
            </div>
          )}

          {description && (
            <p className="mb-3 mt-1 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Footer stats */}
          <div className="mt-3 flex items-center gap-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Dumbbell className="h-3.5 w-3.5" />
              <span>{exerciseCount} exercises</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>{sessionCount} sessions</span>
            </div>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground/60">
            Updated {formatDate(updatedAt)}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
