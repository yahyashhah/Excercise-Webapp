import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { differenceInDays } from "date-fns";
import { SubscriptionStatus } from "@/components/billing/subscription-status";
import { PricingCards } from "@/components/billing/pricing-cards";
import { CreditCard, Clock, AlertCircle, XCircle } from "lucide-react";

export default async function BillingSettingsPage() {
  const user = await requireRole("TRAINER");

  const sub = await prisma.trainerSubscription.findUnique({
    where: { trainerId: user.id },
  });

  const now = new Date();
  const trialDaysRemaining =
    sub?.status === "TRIALING" && sub.trialEndsAt > now
      ? differenceInDays(sub.trialEndsAt, now)
      : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Billing &amp; Subscription</h2>
        <p className="mt-1 text-muted-foreground">
          Manage your plan and payment details
        </p>
      </div>

      {/* ACTIVE — show plan card */}
      {sub?.status === "ACTIVE" && (
        <SubscriptionStatus
          plan={sub.plan}
          currentPeriodEnd={sub.currentPeriodEnd}
          cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
        />
      )}

      {/* TRIALING — show trial status + upgrade options */}
      {sub?.status === "TRIALING" && (
        <>
          <div className="flex items-start gap-4 rounded-xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-blue-900">Free trial active</p>
              {trialDaysRemaining > 0 ? (
                <p className="mt-0.5 text-sm text-blue-700">
                  You have{" "}
                  <span className="font-bold">
                    {trialDaysRemaining} day{trialDaysRemaining !== 1 ? "s" : ""}
                  </span>{" "}
                  remaining. Choose a plan below to continue after your trial ends.
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-blue-700">
                  Your trial ends today. Choose a plan to keep access.
                </p>
              )}
            </div>
          </div>
          <div>
            <h3 className="mb-4 text-lg font-semibold">Choose your plan</h3>
            <PricingCards />
          </div>
        </>
      )}

      {/* PAST_DUE / UNPAID — payment issue */}
      {(sub?.status === "PAST_DUE" || sub?.status === "UNPAID") && (
        <div className="space-y-6">
          <div className="flex items-start gap-4 rounded-xl border border-red-200 bg-red-50 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="font-semibold text-red-900">Payment issue</p>
              <p className="mt-0.5 text-sm text-red-700">
                Your last payment failed. Update your payment method to restore
                full access.
              </p>
            </div>
          </div>
          <SubscriptionStatus
            plan={sub.plan}
            currentPeriodEnd={sub.currentPeriodEnd}
            cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
          />
        </div>
      )}

      {/* CANCELED or no record — show upgrade options */}
      {(!sub || sub.status === "CANCELED") && (
        <div className="space-y-6">
          <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100">
              <XCircle className="h-5 w-5 text-slate-500" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">No active plan</p>
              <p className="mt-0.5 text-sm text-slate-600">
                Your subscription has ended. Pick a plan below to get back in.
              </p>
            </div>
          </div>
          <div>
            <h3 className="mb-4 text-lg font-semibold">Choose your plan</h3>
            <PricingCards />
          </div>
        </div>
      )}

      {/* What's included callout */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="h-4 w-4 text-slate-500" />
          <p className="text-sm font-semibold text-slate-700">All plans include</p>
        </div>
        <ul className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm text-slate-600">
          <li>✓ AI workout generation</li>
          <li>✓ Client progress tracking</li>
          <li>✓ Assessments &amp; check-ins</li>
          <li>✓ Messaging</li>
          <li>✓ Program library</li>
          <li>✓ 14-day free trial</li>
        </ul>
      </div>
    </div>
  );
}
