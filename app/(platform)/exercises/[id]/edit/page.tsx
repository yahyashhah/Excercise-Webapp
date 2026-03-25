import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getExerciseById } from "@/lib/services/exercise.service";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ExerciseEditForm } from "@/components/exercises/exercise-edit-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditExercisePage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (user.role !== "CLINICIAN") redirect("/exercises");

  const exercise = await getExerciseById(id);
  if (!exercise) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/exercises/${id}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Exercise
          </Link>
        </Button>
      </div>
      <ExerciseEditForm exercise={exercise} />
    </div>
  );
}
