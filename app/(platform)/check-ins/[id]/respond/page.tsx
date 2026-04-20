import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import * as checkinService from "@/lib/services/checkin.service";
import { RespondForm } from "./respond-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RespondPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (user.role !== "PATIENT") redirect("/check-ins");

  // id here is the assignment id
  const assignment = await checkinService.getCheckInAssignmentsForPatient(
    user.id
  ).then((list) => list.find((a) => a.id === id));

  if (!assignment) notFound();

  const template = await checkinService.getTemplateById(
    assignment.template.id
  );

  if (!template) notFound();

  return (
    <RespondForm
      assignment={{
        id: assignment.id,
        templateName: template.name,
        frequency: template.frequency,
      }}
      questions={template.questions}
    />
  );
}
