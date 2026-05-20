import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  color?: "primary" | "blue" | "emerald" | "amber" | "rose" | "cyan";
  trend?: { value: number; label: string };
}

const colorMap = {
  primary: { card: "from-primary/8 to-primary/4 border-primary/15",   icon: "bg-primary/10 text-primary",         text: "text-primary" },
  blue:    { card: "from-blue-500/8 to-blue-500/4 border-blue-500/15", icon: "bg-blue-500/10 text-blue-600",       text: "text-blue-600" },
  emerald: { card: "from-emerald-500/8 to-emerald-500/4 border-emerald-500/15", icon: "bg-emerald-500/10 text-emerald-600", text: "text-emerald-600" },
  amber:   { card: "from-amber-500/8 to-amber-500/4 border-amber-500/15", icon: "bg-amber-500/10 text-amber-600", text: "text-amber-600" },
  rose:    { card: "from-rose-500/8 to-rose-500/4 border-rose-500/15", icon: "bg-rose-500/10 text-rose-600",      text: "text-rose-600" },
  cyan:    { card: "from-cyan-500/8 to-cyan-500/4 border-cyan-500/15", icon: "bg-cyan-500/10 text-cyan-600",      text: "text-cyan-600" },
};

export function StatCard({ label, value, sub, icon: Icon, color = "primary", trend }: StatCardProps) {
  const { card, icon: iconCls, text } = colorMap[color];

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border bg-linear-to-br bg-card p-5", card)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground/70">{sub}</p>}
          {trend && (
            <div
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                trend.value >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
              )}
            >
              <span>{trend.value >= 0 ? "↑" : "↓"}</span>
              <span>{Math.abs(trend.value)}% {trend.label}</span>
            </div>
          )}
        </div>
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", iconCls)}>
          <Icon className={cn("h-5 w-5", text)} />
        </div>
      </div>
    </div>
  );
}
