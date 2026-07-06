import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Moon, HeartPulse } from "lucide-react";
import type { WearableDailySummary } from "@prisma/client";

interface WearableSummaryCardProps {
  summary: WearableDailySummary;
}

export function WearableSummaryCard({ summary }: WearableSummaryCardProps) {
  const items = [
    {
      icon: Activity,
      label: "Steps",
      value: summary.steps != null ? summary.steps.toLocaleString() : "—",
    },
    {
      icon: Moon,
      label: "Sleep",
      value:
        summary.sleepDurationMin != null
          ? `${Math.floor(summary.sleepDurationMin / 60)}h ${summary.sleepDurationMin % 60}m`
          : "—",
    },
    {
      icon: HeartPulse,
      label: "Resting HR",
      value: summary.restingHeartRate != null ? `${summary.restingHeartRate} bpm` : "—",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Today&apos;s Activity</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-4">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex flex-col items-center gap-1 text-center">
            <Icon className="h-4.5 w-4.5 text-muted-foreground" />
            <p className="text-lg font-bold leading-none">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
