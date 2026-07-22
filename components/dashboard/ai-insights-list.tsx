"use client";

import { useEffect, useState } from "react";
import { Sparkles, TriangleAlert, Lightbulb, CircleCheck } from "lucide-react";

interface CoachingInsight {
  clientName: string;
  insight: string;
  type: "warning" | "suggestion" | "positive";
}

const typeStyles: Record<CoachingInsight["type"], { icon: typeof Lightbulb; className: string }> = {
  warning: { icon: TriangleAlert, className: "text-red-600" },
  suggestion: { icon: Lightbulb, className: "text-amber-600" },
  positive: { icon: CircleCheck, className: "text-success" },
};

export function AiInsightsList() {
  const [insights, setInsights] = useState<CoachingInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard/ai-insights")
      .then((res) => (res.ok ? res.json() : { insights: null }))
      .then((data) => {
        if (!active) return;
        if (data.insights === null) {
          setUnavailable(true);
          setInsights([]);
        } else {
          setInsights(Array.isArray(data.insights) ? data.insights : []);
        }
      })
      .catch(() => {
        if (active) setUnavailable(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/40" />
        ))}
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Sparkles className="h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          Insights are unavailable right now
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Check back in a little while
        </p>
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Sparkles className="h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">No insights right now</p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Insights appear as your clients log activity
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {insights.map((item, i) => {
        const style = typeStyles[item.type] ?? typeStyles.suggestion;
        const Icon = style.icon;
        return (
          <div
            key={i}
            className="flex items-start gap-2.5 rounded-xl border border-border/60 p-3 transition-colors hover:bg-muted/30"
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.className}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.clientName}</p>
              <p className="text-xs text-muted-foreground">{item.insight}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
