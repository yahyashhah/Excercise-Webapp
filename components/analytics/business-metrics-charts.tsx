"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TrendPoint } from "@/lib/services/business-metrics.service";

const tooltipStyle = {
  backgroundColor: "oklch(1 0 0)",
  border: "1px solid oklch(0.91 0.01 264)",
  borderRadius: "12px",
  color: "oklch(0.13 0.02 264)",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

const axisTick = { fill: "oklch(0.52 0.03 264)", fontSize: 11 };

export function NewClientsTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.01 264)" />
        <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "oklch(0.55 0.18 200 / 0.05)" }} />
        <Bar dataKey="value" fill="oklch(0.55 0.18 200)" radius={[4, 4, 0, 0]} name="New Clients" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AttendanceTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.01 264)" />
        <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          domain={[0, 100]}
          unit="%"
        />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ stroke: "oklch(0.6 0.16 155 / 0.2)" }}
          formatter={(value) => [`${value}%`, "Attendance"]}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="oklch(0.6 0.16 155)"
          strokeWidth={2.5}
          dot={{ fill: "oklch(0.6 0.16 155)", r: 4, strokeWidth: 0 }}
          activeDot={{ r: 6, fill: "oklch(0.6 0.16 155)" }}
          name="Attendance"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
