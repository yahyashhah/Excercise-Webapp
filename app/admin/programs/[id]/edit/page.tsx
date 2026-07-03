import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/current-user";
import { getExercises } from "@/lib/services/exercise.service";
import { getProgramById } from "@/lib/services/program.service";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { AdminProgramEditorWrapper } from "../admin-program-editor-wrapper";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminProgramEditPage({ params }: Props) {
  await requireSuperAdmin();
  const { id } = await params;

  const [program, exercises] = await Promise.all([
    getProgramById(id),
    getExercises(),
  ]);

  if (!program || program.isGlobal) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href={`/admin/programs/${id}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Program
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Edit Program</h1>
        <p className="text-muted-foreground">
          Editing on behalf of the program&apos;s trainer. Changes apply immediately.
        </p>
      </div>
      <AdminProgramEditorWrapper
        program={program as unknown as Record<string, unknown>}
        exercises={exercises}
      />
    </div>
  );
}
