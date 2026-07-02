import { auth } from "@clerk/nextjs/server";
import { requireRole } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { ProgramEditor } from "@/components/programs/program-editor";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function NewProgramPage() {
  const [user, { orgId: sessionOrgId }, exercises] = await Promise.all([
    requireRole("TRAINER"),
    auth(),
    getExercises(),
  ]);
  const organizationOrgId = sessionOrgId ?? user.clerkOrgId ?? undefined;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/programs">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Programs
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Create Program</h1>
        <p className="text-muted-foreground">
          Build a new training program from scratch or start from a template.
        </p>
      </div>
      <ProgramEditor exercises={exercises} organizationOrganizationId={organizationOrgId} />
    </div>
  );
}
