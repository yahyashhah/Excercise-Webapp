import { NextResponse } from "next/server";
import { retryStuckProgramPurchases } from "@/lib/services/program-purchase.service";

/**
 * GET /api/cron/retry-program-purchases
 *
 * Fulfillment for a program purchase runs in the background (see the
 * checkout.session.completed webhook handler), so a failure there can no
 * longer be signaled to Stripe via a retry. This sweep finds any
 * ProgramPurchase left PENDING or FAILED past a grace period and retries
 * fulfillment — safe to run repeatedly, since fulfillment is idempotent.
 *
 * Intended to be called by Vercel Cron (see vercel.json). Secured with the
 * same shared-secret convention as /api/reminders and /api/cron/mark-missed-sessions:
 * when the CRON_SECRET env var is set, the caller must present it as
 *   Authorization: Bearer <CRON_SECRET>
 * Vercel Cron automatically sends this header when CRON_SECRET is configured.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await retryStuckProgramPurchases();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Retry-program-purchases cron job failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
