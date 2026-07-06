import { Webhook } from "svix";
import { NextResponse } from "next/server";
import {
  upsertConnection,
  upsertDailySummaryFields,
  upsertWorkout,
} from "@/lib/services/wearable.service";
import { evaluateWearableAlerts } from "@/lib/services/wearable-alert.service";
import { mapJunctionSlugToProvider } from "@/lib/vital";

interface JunctionEvent {
  event_type: string;
  client_user_id: string;
  data: Record<string, unknown>;
}

export async function POST(req: Request) {
  const secret = process.env.VITAL_WEBHOOK_SECRET;
  if (!secret) {
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new NextResponse("Missing svix headers", { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(secret);

  let event: JunctionEvent;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as JunctionEvent;
  } catch {
    return new NextResponse("Webhook verification failed", { status: 400 });
  }

  const clientId = event.client_user_id;
  const data = event.data;
  const source = data.source as { slug?: string } | undefined;
  const provider = mapJunctionSlugToProvider(source?.slug ?? "");

  switch (event.event_type) {
    case "provider.connection.created": {
      await upsertConnection(clientId, provider, "CONNECTED");
      break;
    }
    case "provider.connection.error": {
      await upsertConnection(clientId, provider, "ERROR");
      break;
    }
    case "daily.data.activity.created":
    case "daily.data.activity.updated": {
      const date = new Date(`${data.calendar_date as string}T00:00:00.000Z`);
      await upsertDailySummaryFields(clientId, date, provider, {
        steps: data.steps as number | undefined,
        activeMinutes: data.active_duration_minutes as number | undefined,
        caloriesBurned: data.calories_active as number | undefined,
      });
      await evaluateWearableAlerts(clientId);
      break;
    }
    case "daily.data.sleep.created":
    case "daily.data.sleep.updated": {
      const date = new Date(`${data.calendar_date as string}T00:00:00.000Z`);
      await upsertDailySummaryFields(clientId, date, provider, {
        sleepDurationMin: data.duration_minutes as number | undefined,
        sleepScore: data.score as number | undefined,
      });
      await evaluateWearableAlerts(clientId);
      break;
    }
    case "daily.data.body.created":
    case "daily.data.body.updated": {
      const date = new Date(`${data.calendar_date as string}T00:00:00.000Z`);
      await upsertDailySummaryFields(clientId, date, provider, {
        restingHeartRate: data.resting_hr as number | undefined,
        hrvMs: data.avg_hrv_sdnn as number | undefined,
      });
      await evaluateWearableAlerts(clientId);
      break;
    }
    case "daily.data.workouts.created":
    case "daily.data.workouts.updated": {
      await upsertWorkout(clientId, provider, data.id as string, {
        activityType: (data.activity_type as string) ?? "unknown",
        startedAt: new Date(data.time_start as string),
        endedAt: new Date(data.time_end as string),
        durationMinutes: Math.round(
          (new Date(data.time_end as string).getTime() -
            new Date(data.time_start as string).getTime()) /
            60_000
        ),
        avgHeartRate: data.heart_rate_avg as number | undefined,
        caloriesBurned: data.calories_total as number | undefined,
        raw: data as never,
      });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
