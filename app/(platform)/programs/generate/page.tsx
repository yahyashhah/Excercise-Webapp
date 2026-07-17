import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GenerateProgramForm } from "@/components/programs/generate-program-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

export const maxDuration = 120; // parallel per-week LLM calls can take up to ~30s; 120s gives headroom for larger programs

export const metadata = {
  title: "Generate AI Program - Unity Health",
  description: "Generate a personalized program using AI",
};

export default async function GenerateProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, role: true, clerkOrgId: true },
  });

  if (!user || user.role !== "TRAINER") {
    redirect("/dashboard");
  }

  const { clientId } = await searchParams;

  // Fetch clients for this trainer's organization with profile fields needed for the inline summary
  const rawClients = user.clerkOrgId
    ? await prisma.user.findMany({
    where: {
      role: 'CLIENT',
      clerkOrgId: user.clerkOrgId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      clientProfile: {
        select: {
          primaryDiagnosis: true,
          painScore: true,
          limitations: true,
          availableEquipment: true,
        },
      },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })
    : []

  const clients = rawClients.map(p => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    primaryDiagnosis: p.clientProfile?.primaryDiagnosis ?? null,
    painScore: p.clientProfile?.painScore ?? null,
    limitations: p.clientProfile?.limitations ?? null,
    availableEquipment: p.clientProfile?.availableEquipment ?? [],
  }))

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2">
        <Link href="/programs">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Programs
        </Link>
      </Button>
      <PageHeader
        title="Generate Program"
        description="Use AI to create a personalised program for a client."
      />

      <div className="max-w-2xl mx-auto">
        <GenerateProgramForm clients={clients} initialClientId={clientId} />
      </div>
    </div>
  );
}
