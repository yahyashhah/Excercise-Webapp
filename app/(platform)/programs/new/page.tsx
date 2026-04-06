import { requireRole } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { ProgramEditor } from "@/components/programs/program-editor";

export default async function NewProgramPage() {
  await requireRole("CLINICIAN");
  const exercises = await getExercises();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Program</h1>
        <p className="text-muted-foreground">
          Build a new training program from scratch or start from a template.
        </p>
      </div>
      <ProgramEditor exercises={exercises} />
    </div>
  );
}
