"use client";

import { useState } from "react";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, CheckCircle } from "lucide-react";
import { formatFeedbackRating } from "@/lib/utils/formatting";

interface ExerciseWithFeedback {
  planExerciseId: string;
  exerciseName: string;
  existingRating?: string;
}

interface PlanFeedbackSectionProps {
  exercises: ExerciseWithFeedback[];
}

export function PlanFeedbackSection({ exercises }: PlanFeedbackSectionProps) {
  const [activeForm, setActiveForm] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());

  const allDone = exercises.every(
    (e) => e.existingRating || submitted.has(e.planExerciseId)
  );

  if (allDone) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-700">
        <CheckCircle className="h-5 w-5" />
        <p className="text-sm font-medium">All feedback submitted. Thank you!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {exercises.map((ex) => {
        const isSubmitted = submitted.has(ex.planExerciseId);

        if (ex.existingRating || isSubmitted) {
          return (
            <div
              key={ex.planExerciseId}
              className="flex items-center justify-between rounded-lg border border-green-100 bg-green-50 px-4 py-3"
            >
              <p className="text-sm font-medium text-slate-700">
                {ex.exerciseName}
              </p>
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                <CheckCircle className="mr-1 h-3 w-3" />
                {formatFeedbackRating(ex.existingRating ?? "FELT_GOOD")}
              </Badge>
            </div>
          );
        }

        if (activeForm === ex.planExerciseId) {
          return (
            <FeedbackForm
              key={ex.planExerciseId}
              planExerciseId={ex.planExerciseId}
              exerciseName={ex.exerciseName}
              onSuccess={() => {
                setSubmitted((prev) => new Set(prev).add(ex.planExerciseId));
                setActiveForm(null);
              }}
            />
          );
        }

        return (
          <div
            key={ex.planExerciseId}
            className="flex items-center justify-between rounded-lg border px-4 py-3"
          >
            <p className="text-sm font-medium text-slate-700">
              {ex.exerciseName}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveForm(ex.planExerciseId)}
            >
              <MessageCircle className="mr-1 h-3 w-3" />
              Leave Feedback
            </Button>
          </div>
        );
      })}
    </div>
  );
}
