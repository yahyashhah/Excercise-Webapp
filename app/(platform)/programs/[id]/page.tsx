import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import * as programService from "@/lib/services/program.service";
import * as sessionService from "@/lib/services/session.service";
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
    const links = await prisma.patientClinicianLink.findMany({
      where: { clinicianId: user.id, status: "active" },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    patients = links.map((l) => l.patient);
  }

  // Load sessions for this program's patient (for calendar tab)
  let sessions: Record<string, unknown>[] = [];
  if (program.patientId) {
    sessions = await sessionService.getSessionsForPatient(
      program.patientId
    );
  }

  return (
    <ProgramDetailView
      program={program as unknown as Record<string, unknown>}
      isClinician={user.role === "CLINICIAN"}
      patients={patients}
      sessions={sessions as Record<string, unknown>[]}
      showAssignDialog={assign === "true"}
    />
  );
}
