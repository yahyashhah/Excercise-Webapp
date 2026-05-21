import { requireSuperAdmin } from "@/lib/current-user";
import { ExerciseForm } from "@/components/exercises/exercise-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function AdminNewExercisePage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/exercises"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Exercises
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Add Exercise</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Add a new exercise to the platform library. All clinicians can use it in programs.
        </p>
      </div>
      <div className="mx-auto max-w-2xl">
        <ExerciseForm />
      </div>
    </div>
  );
}
