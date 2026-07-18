import { NextResponse } from "next/server";
import { getSellablePackageBySlug } from "@/lib/services/sellable-package.service";
import { createProgramCheckoutSession } from "@/lib/payments/program-checkout";

export async function POST(req: Request) {
  const body = (await req.json()) as { slug?: string; withBundle?: boolean };
  if (!body.slug) return new NextResponse("Missing slug", { status: 400 });

  const pkg = await getSellablePackageBySlug(body.slug);
  if (!pkg || !pkg.programTemplateId) {
    return new NextResponse("Package not found", { status: 404 });
  }

  // Prices + templates are ALL server-derived from the package record.
  const packages = [{ name: pkg.name, priceInCents: pkg.priceInCents, currency: pkg.currency }];
  const packageIds = [pkg.id];

  if (body.withBundle && pkg.upsell && pkg.upsell.programTemplateId) {
    packages.push({
      name: pkg.upsell.name,
      priceInCents: pkg.upsell.priceInCents,
      currency: pkg.upsell.currency,
    });
    packageIds.push(pkg.upsell.id);
  }

  try {
    const { url } = await createProgramCheckoutSession({
      packages,
      packageIds,
      successSlug: pkg.slug!,
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error("program checkout error", err);
    return new NextResponse("Checkout error", { status: 500 });
  }
}
