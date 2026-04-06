import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GenerateProgramForm } from "@/components/programs/generate-program-form";
import { getPatientsForClinician } from "@/lib/services/patient.service";

export const metadata = {
  title: "Generate AI Program - Unity Health",
  description: "Generate a personalized program using AI",
};

export default async function GenerateProgramPage() {
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


  // Fetch patients for this clinician
  const patients = await getPatientsForClinician(user.id);

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Generate Program</h2>
      </div>
      
      <div className="max-w-2xl">
        <GenerateProgramForm patients={patients} />
      </div>
    </div>
  );
}