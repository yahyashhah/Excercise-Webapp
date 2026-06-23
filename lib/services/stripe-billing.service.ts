import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { tierFromPriceId } from "@/lib/stripe-config";
import { SubStatus } from "@prisma/client";
import type Stripe from "stripe";

function stripeStatusToSubStatus(status: Stripe.Subscription.Status): SubStatus {
  switch (status) {
    case "active": return "ACTIVE";
    case "trialing": return "TRIALING";
    case "past_due": return "PAST_DUE";
    case "canceled": return "CANCELED";
    case "unpaid": return "UNPAID";
    default: return "ACTIVE";
  }
}

export async function syncSubscriptionFromStripe(
  stripeCustomerId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const plan = priceId ? tierFromPriceId(priceId) : null;

  await prisma.trainerSubscription.update({
    where: { stripeCustomerId },
    data: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      plan: plan ?? "STARTER",
      status: stripeStatusToSubStatus(subscription.status),
      currentPeriodEnd: subscription.items.data[0]?.current_period_end
        ? new Date(subscription.items.data[0].current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}

export async function activateSubscriptionFromCheckout(
  session: Stripe.Checkout.Session
): Promise<void> {
  const stripeCustomerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const plan = priceId ? tierFromPriceId(priceId) : null;

  await prisma.trainerSubscription.update({
    where: { stripeCustomerId },
    data: {
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      plan: plan ?? "STARTER",
      status: "ACTIVE",
      currentPeriodEnd: subscription.items.data[0]?.current_period_end
        ? new Date(subscription.items.data[0].current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}
