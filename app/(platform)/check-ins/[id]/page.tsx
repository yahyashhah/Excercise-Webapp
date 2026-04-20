import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import * as checkinService from "@/lib/services/checkin.service";
import { ReviewClient } from "./review-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ResponseReviewPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();

  // This page is clinician-only
  if (user.role !== "CLINICIAN") redirect("/check-ins");

  const response = await checkinService.getResponseById(id);
  if (!response) notFound();

  // Verify the clinician owns this response's assignment
  if (response.assignment.clinicianId !== user.id) redirect("/check-ins");

  const questions = response.assignment.template.questions;

  // Safely parse answers from Json to a record
  const answers =
    typeof response.answers === "object" && response.answers !== null
      ? (response.answers as Record<string, unknown>)
      : {};

  return (
    <ReviewClient
      response={{
        id: response.id,
        submittedAt: response.submittedAt.toISOString(),
        isReviewed: response.isReviewed,
        reviewedAt: response.reviewedAt?.toISOString() ?? null,
        coachNotes: response.coachNotes ?? "",
        patientName: `${response.patient.firstName} ${response.patient.lastName}`,
        templateName: response.assignment.template.name,
        frequency: response.assignment.template.frequency,
      }}
      questions={questions}
      answers={answers}
    />
  );
}
