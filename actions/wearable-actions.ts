"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import { getOrCreateVitalUserId, createLinkToken } from "@/lib/vital";
import { upsertConnection } from "@/lib/services/wearable.service";
import type { WearableProvider } from "@prisma/client";

export async function createWearableLinkTokenAction() {
  const user = await getCurrentUser();
  if (user.role !== "CLIENT") {
    return { success: false as const, error: "Only clients can connect a wearable" };
  }

  try {
    const vitalUserId = await getOrCreateVitalUserId(user.id);
    const linkToken = await createLinkToken(vitalUserId);
    return { success: true as const, data: { linkToken } };
  } catch (error) {
    console.error("Failed to create wearable link token:", error);
    return { success: false as const, error: "Failed to start wearable connection" };
  }
}

export async function disconnectWearableAction(provider: WearableProvider) {
  const user = await getCurrentUser();
  if (user.role !== "CLIENT") {
    return { success: false as const, error: "Only clients can disconnect a wearable" };
  }

  try {
    await upsertConnection(user.id, provider, "DISCONNECTED");
    revalidatePath("/settings");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to disconnect wearable:", error);
    return { success: false as const, error: "Failed to disconnect wearable" };
  }
}
