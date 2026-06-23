"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TIER_CONFIG, type PlanTier } from "@/lib/stripe-config";
import { format } from "date-fns";

interface SubscriptionStatusProps {
  plan: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export function SubscriptionStatus({
  plan,
  currentPeriodEnd,
  cancelAtPeriodEnd,
}: SubscriptionStatusProps) {
  const [loading, setLoading] = useState(false);

  async function handleManage() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      if (!res.ok) throw new Error("Portal request failed");
      const data = await res.json() as { url: string };
      window.location.href = data.url;
    } catch {
      setLoading(false);
    }
  }

  const tierLabel =
    TIER_CONFIG[plan as PlanTier]?.label ?? plan;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Current Plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">{tierLabel}</span>
          <Badge variant="secondary">Active</Badge>
        </div>
        {currentPeriodEnd && (
          <p className="text-sm text-muted-foreground">
            Next billing date:{" "}
            {format(new Date(currentPeriodEnd), "MMMM d, yyyy")}
          </p>
        )}
        {cancelAtPeriodEnd && (
          <p className="text-sm text-yellow-600">
            Your subscription will cancel at the end of the current billing
            period.
          </p>
        )}
        <Button onClick={handleManage} disabled={loading} variant="outline">
          {loading ? "Redirecting…" : "Manage Subscription"}
        </Button>
      </CardContent>
    </Card>
  );
}
