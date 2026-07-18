"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * Marks a program purchase as fully claimed — called once the buyer has
 * actually finished setting their password (not merely once a sign-in token
 * was minted for them). This is the point that permanently stops the success
 * page from reissuing sign-in tokens for this purchase.
 */
export async function markProgramPurchaseClaimedAction(stripeCheckoutSessionId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const purchase = await prisma.programPurchase.findUnique({
    where: { stripeCheckoutSessionId },
  });
  if (!purchase) return { success: false as const, error: "Purchase not found" };
  if (purchase.buyerClerkId !== userId) return { success: false as const, error: "Forbidden" };

  await prisma.programPurchase.update({
    where: { stripeCheckoutSessionId },
    data: { accountClaimedAt: new Date() },
  });

  return { success: true as const };
}
