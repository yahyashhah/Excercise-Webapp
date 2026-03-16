import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getPlansForPatient, getPlansCreatedBy } from "@/lib/services/workout-plan.service";
import { PlanCard } from "@/components/workout/plan-card";
import { Button } from "@/components/ui/button";
import { Plus, Sparkles } from "lucide-react";

export default async function WorkoutPlansPage() {
  const user = await getCurrentUser();

  const plans =
    user.role === "CLINICIAN"
      ? await getPlansCreatedBy(user.id)
      : await getPlansForPatient(user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {user.role === "CLINICIAN" ? "Workout Plans" : "My Plans"}
          </h2>
          <p className="text-slate-600">{plans.length} plans</p>
        </div>
        {user.role === "CLINICIAN" && (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/workout-plans/generate">
                <Sparkles className="mr-2 h-4 w-4" />
                Generate with AI
              </Link>
            </Button>
          </div>
        )}
      </div>

      {plans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center">
          <p className="text-slate-500">
            {user.role === "CLINICIAN"
              ? "You have not created any plans yet."
              : "No plans assigned to you yet."}
          </p>
          {user.role === "CLINICIAN" && (
            <Button className="mt-4" asChild>
              <Link href="/workout-plans/generate">
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Your First Plan
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
                "patient" in plan
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
