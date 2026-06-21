import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  const subs = await p.trainerSubscription.findMany({ include: { trainer: true } });
  for (const sub of subs) {
    console.log(`${sub.trainer.email} → ${sub.status} | subId: ${sub.stripeSubscriptionId ?? "null"}`);
  }
  await p.$disconnect();
}

main();
