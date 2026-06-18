import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new NextResponse("Missing svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch {
    return new NextResponse("Webhook verification failed", { status: 400 });
  }

  if (evt.type === "user.deleted") {
    const { id } = evt.data;
    if (id) {
      await prisma.user.deleteMany({ where: { clerkId: id } });
    }
  }

  if (evt.type === "user.updated") {
    const { id, image_url, email_addresses } = evt.data;
    const primaryEmail = email_addresses?.[0]?.email_address;
    await prisma.user.updateMany({
      where: { clerkId: id },
      data: {
        imageUrl: image_url,
        ...(primaryEmail ? { email: primaryEmail } : {}),
      },
    });
  }

  if (evt.type === "organizationMembership.created") {
    const { organization, public_user_data } = evt.data as {
      organization: { id: string };
      public_user_data: { user_id: string };
    };

    const clerkUserId = public_user_data.user_id;
    const orgId = organization.id;

    // Fetch full user details from Clerk
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkUserId);
    const primaryEmail =
      clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

    if (primaryEmail) {
      await prisma.user.upsert({
        where: { clerkId: clerkUserId },
        update: {
          clerkOrgId: orgId,
          imageUrl: clerkUser.imageUrl,
          email: primaryEmail,
        },
        create: {
          clerkId: clerkUserId,
          email: primaryEmail,
          firstName: clerkUser.firstName ?? "",
          lastName: clerkUser.lastName ?? "",
          imageUrl: clerkUser.imageUrl,
          role: "CLIENT",
          clerkOrgId: orgId,
          onboarded: false,
        },
      });
    }
  }

  if (evt.type === "organizationMembership.deleted") {
    const { public_user_data } = evt.data as {
      public_user_data: { user_id: string };
    };
    await prisma.user.updateMany({
      where: { clerkId: public_user_data.user_id },
      data: { clerkOrgId: null },
    });
  }

  return new NextResponse("OK", { status: 200 });
}
