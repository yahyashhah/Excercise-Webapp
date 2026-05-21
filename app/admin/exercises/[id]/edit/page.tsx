import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/current-user";
import { getExerciseById } from "@/lib/services/exercise.service";
import { ExerciseEditForm } from "@/components/exercises/exercise-edit-form";
import { ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminEditExercisePage({ params }: Props) {
  await requireSuperAdmin();
  const { id } = await params;

  const exercise = await getExerciseById(id);
  if (!exercise) notFound();

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
        <h1 className="text-2xl font-bold text-foreground">Edit Exercise</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Update the exercise details, video, and media for the platform library.
        </p>
      </div>
      <ExerciseEditForm exercise={exercise} />
    </div>
  );
}
