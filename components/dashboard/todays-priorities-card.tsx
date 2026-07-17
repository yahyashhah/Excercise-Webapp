import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListChecks, ChevronRight, CircleCheck } from "lucide-react";
import type { AlertSeverity, PriorityAlert } from "@/lib/services/dashboard-insights.service";

const severityDot: Record<AlertSeverity, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-success",
};

const severityLabel: Record<AlertSeverity, string> = {
  high: "High",
  medium: "Medium",
  low: "On track",
};

const severityBadge: Record<AlertSeverity, string> = {
  high: "bg-red-500/10 text-red-700",
  medium: "bg-amber-500/10 text-amber-700",
  low: "bg-success/10 text-success",
};

export function TodaysPrioritiesCard({ priorities }: { priorities: PriorityAlert[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4.5 w-4.5 text-primary" />
          <CardTitle className="text-base font-semibold">Today&apos;s Priorities</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {priorities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CircleCheck className="h-10 w-10 text-success/40" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">You&apos;re all caught up</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              No clients need attention right now
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {priorities.map((alert, i) => (
              <Link
                key={`${alert.clientId}-${i}`}
                href={alert.href}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${severityDot[alert.severity]}`} />
                <p className="min-w-0 flex-1 truncate text-sm">{alert.message}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${severityBadge[alert.severity]}`}
                >
                  {severityLabel[alert.severity]}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
