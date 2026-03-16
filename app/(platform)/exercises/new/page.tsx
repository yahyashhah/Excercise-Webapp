import { requireRole } from "@/lib/current-user";
import { ExerciseForm } from "@/components/exercises/exercise-form";

export default async function NewExercisePage() {
  await requireRole("CLINICIAN");

  return (
    <div className="mx-auto max-w-2xl">
      <ExerciseForm />
    </div>
  );
}
