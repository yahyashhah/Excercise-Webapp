import { JunctionClient, JunctionEnvironment } from "@junction-api/sdk";
import { prisma } from "@/lib/prisma";
import type { WearableProvider } from "@prisma/client";

let _client: JunctionClient | null = null;

function getClient(): JunctionClient {
  if (!_client) {
    _client = new JunctionClient({
      apiKey: process.env.VITAL_API_KEY!,
      environment:
        process.env.VITAL_ENV === "production"
          ? JunctionEnvironment.Production
          : JunctionEnvironment.Sandbox,
    });
  }
  return _client;
}

/**
 * Returns the Junction user id for a client, creating both the Junction
 * user and the local WearableAccount cache row on first call.
 */
export async function getOrCreateVitalUserId(clientId: string): Promise<string> {
  const existing = await prisma.wearableAccount.findUnique({
    where: { clientId },
  });
  if (existing) return existing.vitalUserId;

  const created = await getClient().user.create({ clientUserId: clientId });
  await prisma.wearableAccount.create({
    data: { clientId, vitalUserId: created.userId },
  });
  return created.userId;
}

export async function createLinkToken(vitalUserId: string): Promise<string> {
  const result = await getClient().link.token({ userId: vitalUserId });
  return result.linkToken;
}

const SLUG_TO_PROVIDER: Record<string, WearableProvider> = {
  apple_health_kit: "APPLE_HEALTH",
  fitbit: "FITBIT",
  garmin: "GARMIN",
  oura: "OURA",
  whoop_v2: "WHOOP",
  whoop: "WHOOP",
};

export function mapJunctionSlugToProvider(slug: string): WearableProvider {
  return SLUG_TO_PROVIDER[slug] ?? "OTHER";
}
