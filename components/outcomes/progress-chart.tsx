"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatAssessmentType } from "@/lib/utils/formatting";
import { format } from "date-fns";
import type { Assessment } from "@prisma/client";

interface ProgressChartProps {
  assessments: Assessment[];
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function ProgressChart({ assessments }: ProgressChartProps) {
  const types = [...new Set(assessments.map((a) => a.assessmentType))];
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(types.slice(0, 3)));

  const toggleType = (type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Build chart data: group by date, with values per type
  const dateMap = new Map<string, Record<string, number>>();

  for (const a of assessments) {
    if (!activeTypes.has(a.assessmentType)) continue;
    const dateKey = format(new Date(a.createdAt), "yyyy-MM-dd");
    if (!dateMap.has(dateKey)) dateMap.set(dateKey, {});
    dateMap.get(dateKey)![a.assessmentType] = Number(a.value);
  }

  const chartData = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date: format(new Date(date), "MMM d"),
      ...values,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Progress Over Time</CardTitle>
        <div className="flex flex-wrap gap-2 mt-2">
          {types.map((type) => (
            <Button
              key={type}
              size="sm"
              variant={activeTypes.has(type) ? "default" : "outline"}
              onClick={() => toggleType(type)}
              className="text-xs"
            >
              {formatAssessmentType(type)}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            Select assessment types to view progress
          </p>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                {Array.from(activeTypes).map((type, i) => (
                  <Line
                    key={type}
                    type="monotone"
                    dataKey={type}
                    name={formatAssessmentType(type)}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
