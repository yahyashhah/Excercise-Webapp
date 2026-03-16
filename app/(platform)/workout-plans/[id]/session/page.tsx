import { notFound } from "next/navigation";
import { requireRole } from "@/lib/current-user";
import { getPlanById } from "@/lib/services/workout-plan.service";
import { WorkoutSessionTracker } from "@/components/workout/workout-session-tracker";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SessionPage({ params }: Props) {
  const { id } = await params;
  const user = await requireRole("PATIENT");
  const plan = await getPlanById(id);

  if (!plan) notFound();
  if (plan.status !== "ACTIVE") notFound();
  // Only the assigned patient can do a session
  if (plan.patientId !== user.id) notFound();

  return (
    <div className="py-4">
      <WorkoutSessionTracker plan={plan} />
    </div>
  );
}
