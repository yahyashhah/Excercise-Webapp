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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const tooltipStyle = {
  backgroundColor: "oklch(1 0 0)",
  border: "1px solid oklch(0.91 0.01 264)",
  borderRadius: "12px",
  color: "oklch(0.13 0.02 264)",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

export function UserGrowthChart({ data }: { data: { month: string; users: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.01 264)" />
        <XAxis dataKey="month" tick={{ fill: "oklch(0.52 0.03 264)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "oklch(0.52 0.03 264)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "oklch(0.47 0.19 264 / 0.2)" }} />
        <Line type="monotone" dataKey="users" stroke="oklch(0.47 0.19 264)" strokeWidth={2.5}
          dot={{ fill: "oklch(0.47 0.19 264)", r: 4, strokeWidth: 0 }}
          activeDot={{ r: 6, fill: "oklch(0.47 0.19 264)" }} name="New Users" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ProgramCreationChart({ data }: { data: { month: string; programs: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.01 264)" />
        <XAxis dataKey="month" tick={{ fill: "oklch(0.52 0.03 264)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "oklch(0.52 0.03 264)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "oklch(0.55 0.18 200 / 0.05)" }} />
        <Bar dataKey="programs" fill="oklch(0.55 0.18 200)" radius={[4, 4, 0, 0]} name="Programs Created" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SessionActivityChart({ data }: { data: { month: string; sessions: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.01 264)" />
        <XAxis dataKey="month" tick={{ fill: "oklch(0.52 0.03 264)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "oklch(0.52 0.03 264)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "oklch(0.6 0.16 155 / 0.05)" }} />
        <Bar dataKey="sessions" fill="oklch(0.6 0.16 155)" radius={[4, 4, 0, 0]} name="Sessions Completed" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RoleDistributionChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconType="circle" iconSize={8}
          formatter={(value) => <span style={{ color: "oklch(0.52 0.03 264)", fontSize: 12 }}>{value}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}
