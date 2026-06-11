import { notFound } from "next/navigation";
import { requireRole } from "@/lib/current-user";
import * as programService from "@/lib/services/program.service";
import { getExercises } from "@/lib/services/exercise.service";
import { ProgramEditor } from "@/components/programs/program-editor";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProgramPage({ params }: Props) {
  const user = await requireRole("CLINICIAN");
  const { id } = await params;

  const [program, exercises] = await Promise.all([
    programService.getProgramById(id),
    getExercises(),
  ]);

  if (!program || program.clinicianId !== user.id) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href={`/programs/${id}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Program
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Edit Program</h1>
        <p className="text-muted-foreground">
          Modify &ldquo;{program.name}&rdquo;
        </p>
      </div>
      <ProgramEditor
        program={program as unknown as Record<string, unknown>}
        exercises={exercises}
      />
    </div>
  );
}
