import { requireSuperAdmin } from "@/lib/current-user";
import { ExerciseForm } from "@/components/exercises/exercise-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function NewExercisePage() {
  await requireSuperAdmin();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/exercises">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Exercises
          </Link>
        </Button>
      </div>
      <ExerciseForm />
    </div>
  );
}
