import { requireSuperAdmin } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { getProgramById } from "@/lib/services/program.service";
import { notFound } from "next/navigation";
import { GlobalProgramEditorWrapper } from "../../global-program-editor-wrapper";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditGlobalProgramPage({ params }: Props) {
  await requireSuperAdmin();
  const { id } = await params;

  const [program, exercises] = await Promise.all([
    getProgramById(id),
    getExercises(),
  ]);

  if (!program || !program.isGlobal) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Global Program</h1>
        <p className="text-muted-foreground">Changes will be reflected for all clinics after pushing an update.</p>
      </div>
      <GlobalProgramEditorWrapper
        program={program as unknown as Record<string, unknown>}
        exercises={exercises}
      />
    </div>
  );
}
