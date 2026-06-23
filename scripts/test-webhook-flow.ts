/**
 * E2E test: Creates a real Stripe subscription for a trainer, then verifies
 * the webhook handler synced the status to ACTIVE in the database.
 */
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2 });
const prisma = new PrismaClient();

async function run() {
  // Pick the first trainer that has a subscription record
  const sub = await prisma.trainerSubscription.findFirst({
    include: { trainer: true },
  });
  if (!sub) throw new Error("No TrainerSubscription found — run bootstrap script first");

  console.log(`Testing with trainer: ${sub.trainer.email}`);
  console.log(`  DB status before: ${sub.status}`);
  console.log(`  Stripe customer:  ${sub.stripeCustomerId}`);

  // Attach Stripe test payment method (pm_card_visa is always available in test mode)
  const pm = await stripe.paymentMethods.attach("pm_card_visa", {
    customer: sub.stripeCustomerId,
  });
  await stripe.customers.update(sub.stripeCustomerId, {
    invoice_settings: { default_payment_method: pm.id },
  });
  console.log(`  Attached test card: ${pm.id}`);

  // Create a real Stripe subscription (this fires webhooks to our listener)
  const stripeSub = await stripe.subscriptions.create({
    customer: sub.stripeCustomerId,
    items: [{ price: process.env.STRIPE_PRICE_PRO! }],
    expand: ["latest_invoice"],
  });

  console.log(`\nStripe subscription created: ${stripeSub.id}`);
  console.log(`  Stripe status: ${stripeSub.status}`);

  // Wait a moment for the webhook to fire and our handler to process it
  console.log("\nWaiting 3s for webhook to process...");
  await new Promise((r) => setTimeout(r, 3000));

  // Check DB
  const updated = await prisma.trainerSubscription.findUnique({
    where: { trainerId: sub.trainerId },
  });
  console.log(`\nDB status after webhook: ${updated?.status}`);
  console.log(`  stripeSubscriptionId: ${updated?.stripeSubscriptionId}`);
  console.log(`  currentPeriodEnd: ${updated?.currentPeriodEnd}`);

  if (updated?.status === "ACTIVE" && updated?.stripeSubscriptionId === stripeSub.id) {
    console.log("\n✅ WEBHOOK FLOW PASSED — DB synced correctly to ACTIVE");
  } else {
    console.log("\n❌ WEBHOOK FLOW FAILED — DB not updated as expected");
    process.exit(1);
  }

  // Cleanup: cancel the subscription so we don't get charged
  await stripe.subscriptions.cancel(stripeSub.id);
  console.log(`\nCleaned up: subscription ${stripeSub.id} cancelled`);

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
