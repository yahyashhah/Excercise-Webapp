"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { addCoachNotesAction, markReviewedAction } from "@/actions/checkin-actions";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Save,
  User,
} from "lucide-react";
import Link from "next/link";
import { formatDateTime } from "@/lib/utils/formatting";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  orderIndex: number;
  questionText: string;
  questionType: string;
}

interface ResponseData {
  id: string;
  submittedAt: string;
  isReviewed: boolean;
  reviewedAt: string | null;
  coachNotes: string;
  patientName: string;
  templateName: string;
  frequency: string;
}

interface Props {
  response: ResponseData;
  questions: Question[];
  answers: Record<string, unknown>;
}

// ─── Answer renderer ──────────────────────────────────────────────────────────

function AnswerDisplay({
  questionType,
  answer,
}: {
  questionType: string;
  answer: unknown;
}) {
  if (answer === undefined || answer === null) {
    return (
      <span className="text-sm text-muted-foreground italic">No answer</span>
    );
  }

  if (questionType === "SCALE") {
    const val = Number(answer);
    const pct = ((val - 1) / 9) * 100;
    const color =
      val <= 3
        ? "from-emerald-400 to-teal-500"
        : val <= 6
        ? "from-amber-400 to-orange-500"
        : "from-rose-400 to-red-500";

    return (
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-indigo-500 text-lg font-bold text-white shadow-sm">
          {val}
        </div>
        <div className="flex-1 space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full bg-linear-to-r ${color} transition-all`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">out of 10</p>
        </div>
      </div>
    );
  }

  if (questionType === "BOOLEAN") {
    const boolVal = answer === true || answer === "true";
    return (
      <Badge
        className={`text-sm font-semibold border-0 ${
          boolVal
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
        }`}
      >
        {boolVal ? "Yes" : "No"}
      </Badge>
    );
  }

  // TEXT or MULTIPLE_CHOICE
  return (
    <p className="text-sm leading-relaxed text-foreground">
      {String(answer)}
    </p>
  );
}

function frequencyLabel(frequency: string): string {
  const map: Record<string, string> = {
    WEEKLY: "Weekly Check-in",
    BIWEEKLY: "Bi-weekly Check-in",
    MONTHLY: "Monthly Check-in",
  };
  return map[frequency] ?? "Check-in";
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReviewClient({ response, questions, answers }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(response.coachNotes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [isReviewed, setIsReviewed] = useState(response.isReviewed);

  async function handleSaveNotes() {
    if (!notes.trim()) {
      toast.error("Notes cannot be empty");
      return;
    }
    setSavingNotes(true);
    try {
      const result = await addCoachNotesAction(response.id, notes);
      if (result.success) {
        toast.success("Coach notes saved");
        setIsReviewed(true);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleMarkReviewed() {
    setMarkingReviewed(true);
    try {
      const result = await markReviewedAction(response.id);
      if (result.success) {
        toast.success("Marked as reviewed");
        setIsReviewed(true);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setMarkingReviewed(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/check-ins">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">
              {response.templateName}
            </h2>
            <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-0 text-xs">
              {frequencyLabel(response.frequency)}
            </Badge>
            {isReviewed ? (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Reviewed
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs gap-1">
                <Clock className="h-3 w-3" />
                Needs Review
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              {response.patientName}
            </span>
            <span>Submitted {formatDateTime(response.submittedAt)}</span>
          </div>
        </div>
      </div>

      {/* Answers */}
      <div className="space-y-3">
        {questions.map((q, idx) => (
          <Card
            key={q.id}
            className="border-0 shadow-sm ring-1 ring-border/50"
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-start gap-2 text-sm font-semibold text-muted-foreground">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                  {idx + 1}
                </span>
                {q.questionText}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <AnswerDisplay
                questionType={q.questionType}
                answer={answers[q.id]}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Coach notes */}
      <Card className="border-0 shadow-sm ring-1 ring-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coach Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Add your notes, observations, or recommendations for the patient..."
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex items-center justify-between">
            {!isReviewed && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkReviewed}
                disabled={markingReviewed}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                {markingReviewed ? "Saving..." : "Mark as Reviewed"}
              </Button>
            )}
            <div className={!isReviewed ? "" : "ml-auto"}>
              <Button
                size="sm"
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="gap-2 bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-600"
              >
                <Save className="h-4 w-4" />
                {savingNotes ? "Saving..." : "Save Notes"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
