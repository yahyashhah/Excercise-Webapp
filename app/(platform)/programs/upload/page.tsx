import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getClientsForTrainer } from "@/lib/services/client.service";
import { ProgramBriefUpload } from "@/components/programs/program-brief-upload";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Upload Program Brief - Unity Health",
  description: "Upload a program brief file and generate a professional AI program",
};

export default async function ProgramBriefUploadPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, role: true },
  });

  if (!user || user.role !== "TRAINER") {
    redirect("/dashboard");
  }

  const clients = await getClientsForTrainer(user.id);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/programs">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Programs
          </Link>
        </Button>
        <h2 className="text-2xl font-bold">Upload Program Brief</h2>
        <p className="text-muted-foreground">
          Upload a structured brief and let AI generate a full program for review.
        </p>
      </div>
      <div className="max-w-3xl">
        <ProgramBriefUpload clients={clients} />
      </div>
    </div>
  );
}
