"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ComplianceChartProps {
  data: Array<{ week: string; compliance: number; painAvg: number }>;
}

export function ComplianceChart({ data }: ComplianceChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Compliance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" fontSize={12} />
              <YAxis domain={[0, 100]} fontSize={12} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === "compliance") return [`${value}%`, "Compliance"];
                  return [value, "Avg Pain"];
                }}
              />
              <Bar dataKey="compliance" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
