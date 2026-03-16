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
import { ArrowLeft, Edit, Play } from "lucide-react";
import { PlanStatusActions } from "@/components/workout/plan-status-actions";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PlanDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const plan = await getPlanById(id);

  if (!plan) notFound();

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

      {/* Patient info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Patient</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-medium text-slate-900">
            {plan.patient.firstName} {plan.patient.lastName}
          </p>
          <p className="text-sm text-slate-500">{plan.patient.email}</p>
        </CardContent>
      </Card>

      {/* Exercises */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exercises</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {plan.exercises.map((pe, index) => (
              <div
                key={pe.id}
                className="rounded-lg border border-slate-200 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                        {index + 1}
                      </span>
                      <h4 className="font-medium text-slate-900">
                        {pe.exercise.name}
                      </h4>
                    </div>
                    <div className="ml-8 mt-1 flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        {formatBodyRegion(pe.exercise.bodyRegion)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {formatDifficulty(pe.exercise.difficultyLevel)}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right text-sm text-slate-600">
                    <p>
                      {pe.sets} sets x{" "}
                      {pe.reps
                        ? `${pe.reps} reps`
                        : pe.durationSeconds
                          ? `${pe.durationSeconds}s`
                          : ""}
                    </p>
                    {pe.restSeconds && (
                      <p className="text-xs text-slate-400">
                        {pe.restSeconds}s rest
                      </p>
                    )}
                  </div>
                </div>
                {pe.notes && (
                  <p className="ml-8 mt-2 text-sm text-slate-500">
                    {pe.notes}
                  </p>
                )}

                {/* Recent feedback */}
                {pe.feedback.length > 0 && (
                  <div className="ml-8 mt-3 space-y-1">
                    {pe.feedback.map((fb) => (
                      <div
                        key={fb.id}
                        className="flex items-center gap-2 text-xs"
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
        </CardContent>
      </Card>

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
