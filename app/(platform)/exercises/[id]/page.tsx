import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getExerciseById } from "@/lib/services/exercise.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBodyRegion, formatDifficulty } from "@/lib/utils/formatting";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExerciseDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const exercise = await getExerciseById(id);

  if (!exercise) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/exercises">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{exercise.name}</CardTitle>
              <div className="mt-2 flex gap-2">
                <Badge variant="secondary">{formatBodyRegion(exercise.bodyRegion)}</Badge>
                <Badge variant="secondary">{formatDifficulty(exercise.difficultyLevel)}</Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {exercise.description && (
            <div>
              <h3 className="mb-2 font-semibold text-slate-900">Description</h3>
              <p className="text-slate-600">{exercise.description}</p>
            </div>
          )}

          {exercise.instructions && (
            <div>
              <h3 className="mb-2 font-semibold text-slate-900">Instructions</h3>
              <p className="whitespace-pre-line text-slate-600">{exercise.instructions}</p>
            </div>
          )}

          {exercise.equipmentRequired.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold text-slate-900">Equipment</h3>
              <div className="flex flex-wrap gap-2">
                {exercise.equipmentRequired.map((eq) => (
                  <Badge key={eq} variant="outline">{eq}</Badge>
                ))}
              </div>
            </div>
          )}

          {exercise.contraindications.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold text-slate-900">Contraindications</h3>
              <ul className="list-inside list-disc text-slate-600">
                {exercise.contraindications.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Progressions */}
          {exercise.progressionsFrom.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold text-slate-900">Progressions</h3>
              <div className="space-y-2">
                {exercise.progressionsFrom.map((p) => (
                  <Link
                    key={p.id}
                    href={`/exercises/${p.nextExerciseId}`}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50"
                  >
                    <ArrowRight className="h-4 w-4 text-green-600" />
                    <span className="font-medium">{p.nextExercise.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {p.direction === "PROGRESSION" ? "Harder" : "Easier"}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
