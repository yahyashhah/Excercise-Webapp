import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GenerateProgramForm } from "@/components/programs/generate-program-form";
import { getPatientsForClinician } from "@/lib/services/patient.service";

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
    select: { id: true, role: true },
  });

  if (!user || user.role !== "CLINICIAN") {
    redirect("/dashboard");
  }

  const { patientId } = await searchParams;

  // Fetch patients for this clinician
  const patients = await getPatientsForClinician(user.id);

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