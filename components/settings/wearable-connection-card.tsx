"use client";

import { useState, useTransition } from "react";
import { useVitalLink } from "@tryvital/vital-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Watch } from "lucide-react";
import {
  createWearableLinkTokenAction,
  disconnectWearableAction,
} from "@/actions/wearable-actions";
import type { WearableConnection } from "@prisma/client";

interface WearableConnectionCardProps {
  initialConnections: WearableConnection[];
}

export function WearableConnectionCard({
  initialConnections,
}: WearableConnectionCardProps) {
  const [connections, setConnections] = useState(initialConnections);
  const [isPending, startTransition] = useTransition();

  const { open, ready } = useVitalLink({
    env: process.env.NEXT_PUBLIC_VITAL_ENV === "production" ? "production" : "sandbox",
    onSuccess: () => {
      window.location.reload();
    },
  });

  const handleConnect = () => {
    startTransition(async () => {
      const result = await createWearableLinkTokenAction();
      if (result.success) {
        open(result.data.linkToken);
      }
    });
  };

  const handleDisconnect = (provider: WearableConnection["provider"]) => {
    startTransition(async () => {
      const result = await disconnectWearableAction(provider);
      if (result.success) {
        setConnections((prev) => prev.filter((c) => c.provider !== provider));
      }
    });
  };

  const activeConnections = connections.filter((c) => c.status === "CONNECTED");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Watch className="h-4.5 w-4.5" />
          Wearable Device
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeConnections.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              Connect Apple Watch, Fitbit, Garmin, Oura, or Whoop to share your
              sleep, heart rate, and activity data with your trainer.
            </p>
            <Button size="sm" disabled={!ready || isPending} onClick={handleConnect}>
              Connect a wearable
            </Button>
          </>
        ) : (
          <div className="space-y-2">
            {activeConnections.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-border/60 p-3"
              >
                <div>
                  <p className="text-sm font-medium">{c.provider.replace("_", " ")}</p>
                  <Badge variant="outline" className="mt-1 text-xs">
                    Connected
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => handleDisconnect(c.provider)}
                >
                  Disconnect
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
