import { NextResponse } from "next/server";
import { markPastDueSessionsMissed } from "@/lib/services/session.service";

/**
 * GET /api/cron/mark-missed-sessions
 *
 * Finds all WorkoutSessionV2 records still in "SCHEDULED" status whose scheduled
 * date/time is past the configured grace period and flips them to "MISSED".
 *
 * Intended to be called by Vercel Cron (see vercel.json). It can also be invoked
 * manually to backfill sessions that were already overdue.
 *
 * Secured with the same shared-secret convention as /api/reminders: when the
 * CRON_SECRET env var is set, the caller must present it as
 *   Authorization: Bearer <CRON_SECRET>
 * Vercel Cron automatically sends this header when CRON_SECRET is configured.
 */
export async function GET(request: Request) {
  // Validate the cron secret to prevent unauthorized triggers.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const { markedMissed } = await markPastDueSessionsMissed();
    return NextResponse.json({ markedMissed });
  } catch (error) {
    console.error("Mark-missed-sessions cron job failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
