import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getPlansForPatient, getPlansCreatedBy } from "@/lib/services/workout-plan.service";
import { PlanCard } from "@/components/workout/plan-card";
import { Button } from "@/components/ui/button";
import { ClipboardList, Plus, Sparkles } from "lucide-react";

export default async function WorkoutPlansPage() {
  const user = await getCurrentUser();

  const plans =
    user.role === "CLINICIAN"
      ? await getPlansCreatedBy(user.id)
      : await getPlansForPatient(user.id);

  const isClinician = user.role === "CLINICIAN";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isClinician ? "Workout Plans" : "My Plans"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {plans.length} plan{plans.length !== 1 ? "s" : ""}
            {isClinician ? " created" : " assigned to you"}
          </p>
        </div>
        {isClinician && (
          <Button asChild className="shrink-0">
            <Link href="/workout-plans/generate">
              <Sparkles className="mr-2 h-4 w-4" />
              Generate with AI
            </Link>
          </Button>
        )}
      </div>

      {/* Content */}
      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <ClipboardList className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <h3 className="mt-4 text-base font-semibold">
            {isClinician ? "No plans created yet" : "No plans assigned yet"}
          </h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {isClinician
              ? "Use AI to generate a personalised workout plan for a client in seconds."
              : "Your clinician will assign a plan to you soon. Check back later."}
          </p>
          {isClinician && (
            <Button className="mt-5" asChild>
              <Link href="/workout-plans/generate">
                <Sparkles className="mr-2 h-4 w-4" />
                Generate First Plan
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              id={plan.id}
              title={plan.title}
              status={plan.status}
              description={plan.description}
              exerciseCount={plan._count.exercises}
              sessionCount={plan._count.sessions}
              patientName={
                "patient" in plan && plan.patient
                  ? `${plan.patient.firstName} ${plan.patient.lastName}`
                  : undefined
              }
              updatedAt={plan.updatedAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
