export type PlanTier = "STARTER" | "PRO" | "UNLIMITED";

export interface TierConfig {
  label: string;
  priceInCents: number;
  clientLimit: number | null;
  description: string;
  priceId: () => string;
}

export const TIER_CONFIG: Record<PlanTier, TierConfig> = {
  STARTER: {
    label: "Starter",
    priceInCents: 2900,
    clientLimit: 10,
    description: "Up to 10 clients",
    priceId: () => process.env.STRIPE_PRICE_STARTER!,
  },
  PRO: {
    label: "Pro",
    priceInCents: 7900,
    clientLimit: 50,
    description: "Up to 50 clients",
    priceId: () => process.env.STRIPE_PRICE_PRO!,
  },
  UNLIMITED: {
    label: "Unlimited",
    priceInCents: 14900,
    clientLimit: null,
    description: "Unlimited clients",
    priceId: () => process.env.STRIPE_PRICE_UNLIMITED!,
  },
};

export const VALID_TIERS: PlanTier[] = ["STARTER", "PRO", "UNLIMITED"];

export function isValidTier(t: string): t is PlanTier {
  return VALID_TIERS.includes(t as PlanTier);
}

export function tierFromPriceId(priceId: string): PlanTier | null {
  for (const [tier, config] of Object.entries(TIER_CONFIG) as [PlanTier, TierConfig][]) {
    if (config.priceId() === priceId) return tier;
  }
  return null;
}
