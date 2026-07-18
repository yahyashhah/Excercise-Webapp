import { stripe } from "@/lib/stripe";

export async function createProgramCheckoutSession(args: {
  packages: { name: string; priceInCents: number; currency: string }[];
  packageIds: string[];
  successSlug: string;
}): Promise<{ url: string }> {
  // MODEL A: charge on the platform account. The Connect upgrade lives ONLY here:
  // add payment_intent_data.application_fee_amount + transfer_data.destination later.
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: args.packages.map((p) => ({
      price_data: {
        currency: p.currency,
        product_data: { name: p.name },
        unit_amount: p.priceInCents,
      },
      quantity: 1,
    })),
    metadata: {
      purchaseType: "program",
      packageIds: args.packageIds.join(","),
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/p/${args.successSlug}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/p/${args.successSlug}`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url };
}
