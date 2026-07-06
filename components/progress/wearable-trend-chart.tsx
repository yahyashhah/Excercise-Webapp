"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import type { WearableDailySummary } from "@prisma/client";

interface WearableTrendChartProps {
  data: WearableDailySummary[];
  metric: "steps" | "sleepDurationMin" | "restingHeartRate" | "hrvMs";
  label: string;
}

export function WearableTrendChart({ data, metric, label }: WearableTrendChartProps) {
  const chartData = data
    .filter((d) => d[metric] != null)
    .map((d) => ({
      date: format(new Date(d.date), "MMM d"),
      value: d[metric] as number,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border">
        <p className="text-sm text-muted-foreground">No {label.toLowerCase()} data yet.</p>
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip />
          <Line type="monotone" dataKey="value" name={label} stroke="#3b82f6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
