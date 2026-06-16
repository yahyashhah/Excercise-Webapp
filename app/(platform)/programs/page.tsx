import { getCurrentUser } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { ProgramListClient } from "@/components/programs/program-list-client";

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    template?: string;
    tab?: string;
  }>;
}

export default async function ProgramsPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  const params = await searchParams;

  const tab =
    params.tab === "templates"
      ? "templates"
      : "programs";

  const [programs, globalPrograms] = await Promise.all([
    user.role === "CLINICIAN"
      ? programService.getPrograms(user.id, {
          search: params.search,
          status: params.status as any,
          isTemplate: tab === "templates",
        })
      : programService.getProgramsForPatient(user.id),
    user.role === "CLINICIAN" ? programService.getGlobalPrograms() : Promise.resolve([]),
  ]);

  // For each clinic program that came from a global master, check if master has been updated
  const updatableIds = new Set<string>(
    programs
      .filter((p) => {
        if (!p.sourceTemplateId) return false;
        const master = globalPrograms.find((g) => g.id === p.sourceTemplateId);
        if (!master?.globalUpdatedAt) return false;
        return new Date(master.globalUpdatedAt) > new Date(p.createdAt);
      })
      .map((p) => p.id)
  );

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
      <ProgramListClient
        programs={programs}
        globalPrograms={globalPrograms}
        updatableIds={[...updatableIds]}
        role={user.role}
      />
    </div>
  );
}
