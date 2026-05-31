import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import * as programService from "@/lib/services/program.service";
import { getPatientsForClinician } from "@/lib/services/patient.service";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ProgramDetailView } from "@/components/programs/program-detail-view";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assign?: string }>;
}

export default async function ProgramDetailPage({
  params,
  searchParams,
}: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  const { assign } = await searchParams;

  const program = await programService.getProgramById(id);
  if (!program) notFound();

  // Authorization: clinician who created it OR assigned patient
  if (program.clinicianId !== user.id && program.patientId !== user.id) {
    notFound();
  }

  // Load patients for assignment dialog (clinician only)
  let patients: { id: string; firstName: string; lastName: string }[] = [];
  if (user.role === "CLINICIAN") {
    const linkedPatients = await getPatientsForClinician(user.id);
    patients = linkedPatients.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
    }));
  }

  // Load sessions for workouts in this specific program (template + assigned)
  const workoutIds = (program.workouts ?? []).map((w) => w.id);
  let sessions: Record<string, unknown>[] = [];
  if (workoutIds.length > 0) {
    sessions = (await prisma.workoutSessionV2.findMany({
      where: { workoutId: { in: workoutIds } },
      include: {
        workout: {
          include: {
            program: { select: { id: true, name: true } },
            blocks: {
              include: {
                exercises: {
                  include: {
                    exercise: true,
                    sets: { orderBy: { orderIndex: "asc" } },
                  },
                  orderBy: { orderIndex: "asc" },
                },
              },
              orderBy: { orderIndex: "asc" },
            },
          },
        },
        exerciseLogs: {
          include: { setLogs: { orderBy: { setIndex: "asc" } } },
          orderBy: { orderIndex: "asc" },
        },
        feedback: true,
      },
      orderBy: { scheduledDate: "asc" },
    })) as unknown as Record<string, unknown>[];
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/programs">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Programs
        </Link>
      </Button>
      <ProgramDetailView
        program={program as unknown as Record<string, unknown>}
        isClinician={user.role === "CLINICIAN"}
        patients={patients}
        sessions={sessions as Record<string, unknown>[]}
        showAssignDialog={assign === "true"}
      />
    </div>
  );
}
