import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getPlanById } from "@/lib/services/workout-plan.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { WorkoutPlanEditor } from "@/components/workout/workout-plan-editor";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPlanPage({ params }: Props) {
  const { id } = await params;
  await requireRole("CLINICIAN");
  const plan = await getPlanById(id);

  if (!plan) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/workout-plans/${id}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Plan
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit: {plan.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkoutPlanEditor plan={plan} />
        </CardContent>
      </Card>
    </div>
  );
}
