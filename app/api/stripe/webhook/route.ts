import { NextResponse, after } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import {
  syncSubscriptionFromStripe,
  activateSubscriptionFromCheckout,
} from "@/lib/services/stripe-billing.service";
import { fulfillProgramPurchase } from "@/lib/services/program-purchase.service";
import type Stripe from "stripe";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return new NextResponse("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return new NextResponse(`Webhook signature verification failed: ${err}`, {
      status: 400,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.purchaseType === "program") {
          // Fulfillment (account creation + program clone) can take many
          // seconds for a large program — too slow to make Stripe wait on.
          // Ack the webhook immediately and run fulfillment via `after()`;
          // errors there can no longer be signaled to Stripe via retry, so we
          // mark the purchase FAILED for the /api/cron/retry-program-purchases
          // sweep to pick up instead.
          const input = {
            id: session.id,
            email: session.customer_details?.email ?? session.customer_email ?? null,
            amountTotal: session.amount_total,
            currency: session.currency,
            packageIds: (session.metadata.packageIds ?? "").split(",").filter(Boolean),
          };
          after(async () => {
            try {
              await fulfillProgramPurchase(input);
            } catch (err) {
              console.error("fulfillProgramPurchase failed (background):", err);
              await prisma.programPurchase
                .updateMany({
                  where: { stripeCheckoutSessionId: input.id, status: { not: "COMPLETED" } },
                  data: { status: "FAILED" },
                })
                .catch(() => {});
            }
          });
        } else {
          await activateSubscriptionFromCheckout(session);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscriptionFromStripe(sub.customer as string, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.trainerSubscription.update({
          where: { stripeCustomerId: sub.customer as string },
          data: { status: "CANCELED" },
        });
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await prisma.trainerSubscription.update({
          where: { stripeCustomerId: invoice.customer as string },
          data: { status: "PAST_DUE" },
        });
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const piId = charge.payment_intent as string | null;
        if (piId) {
          // Find the checkout session for this payment intent
          const sessions = await stripe.checkout.sessions.list({ payment_intent: piId, limit: 1 });
          const sessionId = sessions.data[0]?.id;
          if (sessionId) {
            const purchase = await prisma.programPurchase.findUnique({
              where: { stripeCheckoutSessionId: sessionId },
            });
            if (purchase && purchase.assignedProgramIds.length > 0) {
              await prisma.program.updateMany({
                where: { id: { in: purchase.assignedProgramIds } },
                data: { status: "PAUSED" },
              });
              await prisma.programPurchase.update({
                where: { id: purchase.id },
                data: { status: "REFUNDED" },
              });
            }
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err);
    return new NextResponse("Internal error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}
