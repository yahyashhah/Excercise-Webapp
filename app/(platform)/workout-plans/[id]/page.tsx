import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getPlanById } from "@/lib/services/workout-plan.service";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlanStatusBadge } from "@/components/workout/plan-status-badge";
import { PlanFeedbackSection } from "@/components/workout/plan-feedback-section";
import { FeedbackList } from "@/components/feedback/feedback-list";
import {
  formatBodyRegion,
  formatDifficulty,
  formatFeedbackRating,
} from "@/lib/utils/formatting";
import { ArrowLeft, Edit, Play, Download } from "lucide-react";
import { ExerciseVideoPlayer } from "@/components/exercises/exercise-video-player";
import { ExerciseImageLightbox } from "@/components/exercises/exercise-image-lightbox";
import { PlanStatusActions } from "@/components/workout/plan-status-actions";
import { AssignClientDialog } from "@/components/workout/assign-client-dialog";
import { getPatientsForClinician } from "@/lib/services/patient.service";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PlanDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const plan = await getPlanById(id);

  if (!plan) notFound();

  const clients =
    user.role === "CLINICIAN"
      ? await getPatientsForClinician(user.id)
      : [];

  // FIX 7: Verify access — patient must be assigned, clinician must be creator
  if (user.role === "PATIENT" && plan.patientId !== user.id) notFound();
  if (user.role === "CLINICIAN" && plan.createdById !== user.id) notFound();

  // FIX 2: Load feedback data based on role
  const existingFeedback =
    user.role === "PATIENT"
      ? await prisma.exerciseFeedback.findMany({
          where: { patientId: user.id, planExercise: { planId: id } },
          select: { planExerciseId: true, rating: true, comment: true },
        })
      : [];

  const allFeedback =
    user.role === "CLINICIAN"
      ? await prisma.exerciseFeedback.findMany({
          where: { planExercise: { planId: id } },
          include: {
            patient: true,
            planExercise: { include: { exercise: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

  // Build patient feedback exercise list
  const feedbackByExerciseId = new Map(
    existingFeedback.map((fb) => [fb.planExerciseId, fb])
  );

  const exercisesForFeedback = plan.exercises.map((pe) => ({
    planExerciseId: pe.id,
    exerciseName: pe.exercise.name,
    existingRating: feedbackByExerciseId.get(pe.id)?.rating,
  }));

  // Build clinician feedback items
  const feedbackItems = allFeedback.map((fb) => ({
    id: fb.id,
    rating: fb.rating,
    comment: fb.comment,
    clinicianResponse: fb.clinicianResponse,
    createdAt: fb.createdAt,
    exerciseName: fb.planExercise.exercise.name,
    patientName: `${fb.patient.firstName} ${fb.patient.lastName}`,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/workout-plans">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      {/* Plan header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{plan.title}</CardTitle>
              <div className="mt-2 flex items-center gap-2">
                <PlanStatusBadge status={plan.status} />
                <span className="text-sm text-slate-500">
                  v{plan.version} | {plan.exercises.length} exercises |{" "}
                  {plan._count.sessions} sessions
                </span>
              </div>
              {plan.description && (
                <p className="mt-2 text-slate-600">{plan.description}</p>
              )}
            </div>
            <div className="flex gap-2">
              {user.role === "CLINICIAN" && (
                <>
                  <PlanStatusActions
                    planId={plan.id}
                    currentStatus={plan.status}
                  />
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/workout-plans/${plan.id}/edit`}>
                      <Edit className="mr-1 h-4 w-4" />
                      Edit
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`/api/workout-plans/${plan.id}/pdf`}
                      download
                    >
                      <Download className="mr-1 h-4 w-4" />
                      PDF
                    </a>
                  </Button>
                </>
              )}
              {user.role === "PATIENT" && plan.status === "ACTIVE" && (
                <Button size="sm" asChild>
                  <Link href={`/workout-plans/${plan.id}/session`}>
                    <Play className="mr-1 h-4 w-4" />
                    Start Session
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Client info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Client</CardTitle>
            {user.role === "CLINICIAN" && (
              <AssignClientDialog
                planId={plan.id}
                currentPatientId={plan.patientId}
                clients={clients.map((c) => ({
                  id: c.id,
                  firstName: c.firstName,
                  lastName: c.lastName,
                  email: c.email,
                }))}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {plan.patient ? (
            <>
              <p className="font-medium text-slate-900">
                {plan.patient.firstName} {plan.patient.lastName}
              </p>
              <p className="text-sm text-slate-500">{plan.patient.email}</p>
            </>
          ) : (
            <p className="text-sm text-slate-500 italic">No client assigned yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Exercises — grouped by Day → Phase */}
      {(() => {
        const PHASE_ORDER = ["WARMUP", "ACTIVATION", "STRENGTHENING", "MOBILITY", "COOLDOWN"];
        const PHASE_LABELS: Record<string, string> = {
          WARMUP: "Warm-Up",
          ACTIVATION: "Activation",
          STRENGTHENING: "Strengthening",
          MOBILITY: "Mobility",
          COOLDOWN: "Cool-Down",
        };
        const PHASE_COLORS: Record<string, string> = {
          WARMUP: "bg-orange-100 text-orange-700 border-orange-200",
          ACTIVATION: "bg-yellow-100 text-yellow-700 border-yellow-200",
          STRENGTHENING: "bg-blue-100 text-blue-700 border-blue-200",
          MOBILITY: "bg-purple-100 text-purple-700 border-purple-200",
          COOLDOWN: "bg-teal-100 text-teal-700 border-teal-200",
        };

        // Group by dayOfWeek (null → day 0)
        const byDay = new Map<number, typeof plan.exercises>();
        for (const pe of plan.exercises) {
          const day = pe.dayOfWeek ?? 0;
          if (!byDay.has(day)) byDay.set(day, []);
          byDay.get(day)!.push(pe);
        }
        const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b);

        return sortedDays.map((day) => {
          const dayExercises = byDay.get(day)!;

          // Group within day by phase
          const byPhase = new Map<string, typeof plan.exercises>();
          for (const pe of dayExercises) {
            const phase = pe.exercise.exercisePhase ?? "STRENGTHENING";
            if (!byPhase.has(phase)) byPhase.set(phase, []);
            byPhase.get(phase)!.push(pe);
          }
          const sortedPhases = Array.from(byPhase.keys()).sort(
            (a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b)
          );

          return (
            <Card key={day}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                    {day === 0 ? "—" : day}
                  </span>
                  {day === 0 ? "Exercises" : `Day ${day}`}
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    ({dayExercises.length} exercise{dayExercises.length !== 1 ? "s" : ""})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-0">
                {sortedPhases.map((phase) => {
                  const phaseExercises = byPhase.get(phase)!;
                  const phaseColorClass = PHASE_COLORS[phase] ?? "bg-slate-100 text-slate-700 border-slate-200";

                  return (
                    <div key={phase}>
                      {/* Phase header */}
                      <div className={`mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${phaseColorClass}`}>
                        {PHASE_LABELS[phase] ?? phase}
                      </div>

                      <div className="space-y-3">
                        {phaseExercises.map((pe, index) => (
                          <div
                            key={pe.id}
                            className="rounded-lg border border-slate-200 overflow-hidden"
                          >
                            {/* Exercise header with image */}
                            <div className="flex items-stretch">
                              {/* Thumbnail — click to enlarge */}
                              <div className="relative shrink-0">
                                <ExerciseImageLightbox
                                  src={pe.exercise.imageUrl}
                                  videoUrl={pe.exercise.videoUrl}
                                  alt={pe.exercise.name}
                                  bodyRegion={pe.exercise.bodyRegion}
                                  label={pe.exercise.name.split(" ").slice(0, 2).join(" ")}
                                  thumbnailClassName="relative h-28 w-28 shrink-0 md:h-32 md:w-32"
                                />
                                <span className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow z-10 pointer-events-none">
                                  {index + 1}
                                </span>
                              </div>

                              {/* Exercise info */}
                              <div className="flex flex-1 items-start justify-between p-4">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-slate-900">
                                    {pe.exercise.name}
                                  </h4>
                                  <div className="mt-1 flex flex-wrap gap-1.5">
                                    <Badge variant="outline" className="text-xs">
                                      {formatBodyRegion(pe.exercise.bodyRegion)}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      {formatDifficulty(pe.exercise.difficultyLevel)}
                                    </Badge>
                                  </div>
                                  {pe.exercise.musclesTargeted && pe.exercise.musclesTargeted.length > 0 && (
                                    <p className="mt-1 text-xs text-slate-400">
                                      {pe.exercise.musclesTargeted.slice(0, 3).join(" · ")}
                                    </p>
                                  )}
                                </div>
                                <div className="ml-4 text-right text-sm text-slate-700 shrink-0">
                                  <p className="font-semibold">
                                    {pe.sets} × {pe.reps ? `${pe.reps} reps` : pe.durationSeconds ? `${pe.durationSeconds}s` : ""}
                                  </p>
                                  {pe.restSeconds && (
                                    <p className="text-xs text-slate-400 mt-0.5">
                                      {pe.restSeconds}s rest
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Form cues / notes */}
                            {(pe.notes || pe.exercise.cuesThumbnail) && (
                              <div className="px-4 pb-3 border-t border-slate-100 bg-slate-50">
                                <p className="pt-2 text-sm text-slate-600 leading-relaxed">
                                  {pe.notes || pe.exercise.cuesThumbnail}
                                </p>
                              </div>
                            )}

                            {/* Common mistakes */}
                            {pe.exercise.commonMistakes && (
                              <div className="px-4 pb-3 bg-amber-50 border-t border-amber-100">
                                <p className="pt-2 text-xs text-amber-700">
                                  <span className="font-semibold">Common mistakes: </span>
                                  {pe.exercise.commonMistakes}
                                </p>
                              </div>
                            )}

                            {/* Video player */}
                            {(pe.exercise.videoUrl || (pe.exercise.media && pe.exercise.media.length > 0)) && (
                              <div className="p-4 border-t border-slate-100">
                                <p className="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Video Demo</p>
                                <ExerciseVideoPlayer
                                  videoUrl={pe.exercise.videoUrl}
                                  mediaItems={pe.exercise.media}
                                  className="max-w-lg"
                                />
                              </div>
                            )}

                            {/* Recent feedback */}
                            {pe.feedback.length > 0 && (
                              <div className="px-4 pb-3 border-t border-slate-100 space-y-1">
                                {pe.feedback.map((fb) => (
                                  <div
                                    key={fb.id}
                                    className="flex items-center gap-2 text-xs pt-2"
                                  >
                                    <Badge
                                      variant={
                                        fb.rating === "PAINFUL" ? "destructive" : "secondary"
                                      }
                                      className="text-xs"
                                    >
                                      {formatFeedbackRating(fb.rating)}
                                    </Badge>
                                    {fb.comment && (
                                      <span className="text-slate-500">{fb.comment}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        });
      })()}

      {/* Patient: Your Feedback */}
      {user.role === "PATIENT" && plan.status === "ACTIVE" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanFeedbackSection exercises={exercisesForFeedback} />
          </CardContent>
        </Card>
      )}

      {/* Clinician: Patient Feedback */}
      {user.role === "CLINICIAN" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patient Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <FeedbackList items={feedbackItems} isClinician={true} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
