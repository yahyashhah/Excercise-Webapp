import { requireSuperAdmin } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { GlobalProgramEditorWrapper } from "../global-program-editor-wrapper";

export default async function NewGlobalProgramPage() {
  await requireSuperAdmin();
  const exercises = await getExercises();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Global Program</h1>
        <p className="text-muted-foreground">
          Create a master program that will be available to all clinics.
        </p>
      </div>
      <GlobalProgramEditorWrapper exercises={exercises} />
    </div>
  );
}
