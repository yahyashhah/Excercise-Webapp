import { getCurrentUser } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { ProgramListClient } from "@/components/programs/program-list-client";

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    template?: string;
  }>;
}

export default async function ProgramsPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  const params = await searchParams;

  const programs =
    user.role === "CLINICIAN"
      ? await programService.getPrograms(user.id, {
          search: params.search,
          status: params.status as any,
          isTemplate: params.template === "true" ? true : undefined,
        })
      : await programService.getProgramsForPatient(user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {user.role === "CLINICIAN" ? "Programs" : "My Programs"}
          </h1>
          <p className="text-muted-foreground">
            {user.role === "CLINICIAN"
              ? "Create, manage, and assign training programs to your clients."
              : `You have ${programs.length} programs assigned.`}
          </p>
        </div>
      </div>
      <ProgramListClient programs={programs} role={user.role} />
    </div>
  );
}
