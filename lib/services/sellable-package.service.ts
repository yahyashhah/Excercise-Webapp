import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils/slug";
import type { CoachPackage } from "@prisma/client";

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "package";
  let candidate = root;
  let n = 1;
  // findUnique on the unique `slug` field
  while (await prisma.coachPackage.findUnique({ where: { slug: candidate } })) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}

export async function createSellablePackage(args: {
  trainerId: string;
  name: string;
  description?: string;
  priceInCents: number;
  programTemplateId: string;
  kind?: "program" | "bundle";
  upsellPackageId?: string;
}): Promise<CoachPackage> {
  const slug = await uniqueSlug(args.name);
  return prisma.coachPackage.create({
    data: {
      trainerId: args.trainerId,
      name: args.name,
      description: args.description,
      priceInCents: args.priceInCents,
      programTemplateId: args.programTemplateId,
      kind: args.kind ?? "program",
      upsellPackageId: args.upsellPackageId,
      slug,
    },
  });
}

export async function getSellablePackageBySlug(
  slug: string
): Promise<(CoachPackage & { upsell: CoachPackage | null }) | null> {
  const pkg = await prisma.coachPackage.findFirst({
    where: { slug, isActive: true },
  });
  if (!pkg) return null;
  const upsell = pkg.upsellPackageId
    ? await prisma.coachPackage.findUnique({ where: { id: pkg.upsellPackageId } })
    : null;
  return { ...pkg, upsell };
}
