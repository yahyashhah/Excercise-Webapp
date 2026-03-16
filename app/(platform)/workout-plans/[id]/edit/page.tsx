import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getPlanById } from "@/lib/services/workout-plan.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

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
          <p className="text-slate-600">
            Plan editing interface coming soon. You can manage exercises and settings from the plan detail view.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
