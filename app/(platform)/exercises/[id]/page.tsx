import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getExerciseById } from "@/lib/services/exercise.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBodyRegion, formatDifficulty } from "@/lib/utils/formatting";
import { ArrowLeft, ArrowRight, Edit } from "lucide-react";
import { ExerciseVideoPlayer } from "@/components/exercises/exercise-video-player";
import { ExerciseImage } from "@/components/exercises/exercise-image";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExerciseDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const exercise = await getExerciseById(id);
  const hasAttachedVideo = exercise?.media?.some(
    (item) => item.mediaType?.toLowerCase() === "video"
  );

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
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary">{formatBodyRegion(exercise.bodyRegion)}</Badge>
                <Badge variant="secondary">{formatDifficulty(exercise.difficultyLevel)}</Badge>
                {exercise.exercisePhase && (
                  <Badge className="bg-indigo-100 text-indigo-700 border-0">
                    {exercise.exercisePhase.charAt(0) + exercise.exercisePhase.slice(1).toLowerCase()}
                  </Badge>
                )}
              </div>
            </div>
            {user.role === "CLINICIAN" && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/exercises/${exercise.id}/edit`}>
                  <Edit className="mr-1 h-4 w-4" />
                  Edit
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Primary Image + Video — attached video has priority over fallback videoUrl */}
          <div className={`grid gap-4 ${exercise.videoUrl || hasAttachedVideo ? "sm:grid-cols-2" : "sm:grid-cols-1 max-w-sm"}`}>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-500 uppercase tracking-wide">Photo</h3>
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-100">
                <ExerciseImage
                  src={exercise.imageUrl}
                  alt={exercise.name}
                  bodyRegion={exercise.bodyRegion}
                  videoUrl={exercise.videoUrl}
                />
              </div>
            </div>
            {(exercise.videoUrl || hasAttachedVideo) && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-500 uppercase tracking-wide">Video Demo</h3>
                <ExerciseVideoPlayer
                  videoUrl={exercise.videoUrl}
                  mediaItems={exercise.media}
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* Additional media gallery */}
          {exercise.media.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">Media Gallery</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {exercise.media.map((item) => (
                  <div key={item.id} className="rounded-lg overflow-hidden bg-slate-100">
                    {item.mediaType === "image" ? (
                      <ExerciseImage
                        src={item.url}
                        alt={item.altText ?? exercise.name}
                        bodyRegion={exercise.bodyRegion}
                        className="h-32 w-full object-cover"
                        gradientClassName="h-32 w-full flex items-center justify-center"
                      />
                    ) : (
                      <ExerciseVideoPlayer
                        videoUrl={item.url}
                        mediaItems={[]}
                        className="w-full"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {exercise.description && (
            <div>
              <h3 className="mb-2 font-semibold text-slate-900">Description</h3>
              <p className="text-slate-600">{exercise.description}</p>
            </div>
          )}

          {/* Muscles targeted */}
          {exercise.musclesTargeted && exercise.musclesTargeted.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold text-slate-900">Muscles Targeted</h3>
              <div className="flex flex-wrap gap-2">
                {exercise.musclesTargeted.map((m: string) => (
                  <Badge key={m} variant="outline" className="text-xs capitalize">{m}</Badge>
                ))}
              </div>
            </div>
          )}

          {exercise.instructions && (
            <div>
              <h3 className="mb-2 font-semibold text-slate-900">Instructions</h3>
              <p className="whitespace-pre-line text-slate-600 leading-relaxed">{exercise.instructions}</p>
            </div>
          )}

          {/* Form cues */}
          {exercise.cuesThumbnail && (
            <div className="rounded-lg bg-blue-50 p-4 border border-blue-100">
              <h3 className="mb-1 text-sm font-semibold text-blue-800">Key Form Cues</h3>
              <p className="text-sm text-blue-700">{exercise.cuesThumbnail}</p>
            </div>
          )}

          {/* Common mistakes */}
          {exercise.commonMistakes && (
            <div className="rounded-lg bg-amber-50 p-4 border border-amber-100">
              <h3 className="mb-1 text-sm font-semibold text-amber-800">Common Mistakes to Avoid</h3>
              <p className="text-sm text-amber-700">{exercise.commonMistakes}</p>
            </div>
          )}

          {/* Default prescription */}
          {(exercise.defaultSets || exercise.defaultReps || exercise.defaultHoldSeconds) && (
            <div>
              <h3 className="mb-2 font-semibold text-slate-900">Default Prescription</h3>
              <p className="text-slate-600">
                {exercise.defaultSets && `${exercise.defaultSets} sets`}
                {exercise.defaultReps && ` × ${exercise.defaultReps} reps`}
                {exercise.defaultHoldSeconds && ` × ${exercise.defaultHoldSeconds}s hold`}
              </p>
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
