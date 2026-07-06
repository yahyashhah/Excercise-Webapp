import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WearableTrendChart } from "@/components/progress/wearable-trend-chart";
import { format } from "date-fns";
import type {
  WearableConnection,
  WearableDailySummary,
  WearableWorkout,
} from "@prisma/client";

interface WearablesTabProps {
  connections: WearableConnection[];
  summaries: WearableDailySummary[];
  workouts: WearableWorkout[];
}

export function WearablesTab({ connections, summaries, workouts }: WearablesTabProps) {
  const connected = connections.filter((c) => c.status === "CONNECTED");

  if (connected.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="text-base font-medium text-muted-foreground">
          No wearable connected yet
        </p>
        <p className="text-sm text-muted-foreground/70">
          Data will appear here once the client connects a device from their settings page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {connected.map((c) => (
          <Badge key={c.id} variant="outline">
            {c.provider.replace("_", " ")}
          </Badge>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Sleep (minutes)</CardTitle>
          </CardHeader>
          <CardContent>
            <WearableTrendChart data={summaries} metric="sleepDurationMin" label="Sleep" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Resting Heart Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <WearableTrendChart
              data={summaries}
              metric="restingHeartRate"
              label="Resting HR"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">HRV</CardTitle>
          </CardHeader>
          <CardContent>
            <WearableTrendChart data={summaries} metric="hrvMs" label="HRV" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Daily Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <WearableTrendChart data={summaries} metric="steps" label="Steps" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Recent Workouts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {workouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No device-detected workouts yet.</p>
          ) : (
            workouts.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between rounded-xl border border-border/60 p-3"
              >
                <div>
                  <p className="text-sm font-medium capitalize">{w.activityType}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(w.startedAt), "MMM d, yyyy · h:mm a")}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">{w.durationMinutes} min</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
