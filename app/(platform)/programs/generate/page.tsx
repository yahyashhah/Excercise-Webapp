import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GenerateProgramForm } from "@/components/programs/generate-program-form";

export const metadata = {
  title: "Generate AI Program - Unity Health",
  description: "Generate a personalized program using AI",
};

export default async function GenerateProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, role: true, clerkOrgId: true },
  });

  if (!user || user.role !== "CLINICIAN") {
    redirect("/dashboard");
  }

  const { patientId } = await searchParams;

  // Fetch patients for this clinician's organization with profile fields needed for the inline summary
  const rawPatients = user.clerkOrgId
    ? await prisma.user.findMany({
    where: {
      role: 'PATIENT',
      clerkOrgId: user.clerkOrgId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      patientProfile: {
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

  const patients = rawPatients.map(p => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    primaryDiagnosis: p.patientProfile?.primaryDiagnosis ?? null,
    painScore: p.patientProfile?.painScore ?? null,
    limitations: p.patientProfile?.limitations ?? null,
    availableEquipment: p.patientProfile?.availableEquipment ?? [],
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Generate Program</h2>
        <p className="text-muted-foreground">
          Use AI to create a personalised program for a client.
        </p>
      </div>

      <div className="max-w-2xl">
        <GenerateProgramForm patients={patients} initialPatientId={patientId} />
      </div>
    </div>
  );
}
