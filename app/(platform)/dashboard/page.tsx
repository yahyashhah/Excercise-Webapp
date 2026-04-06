import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { ClinicianDashboard } from "@/components/dashboard/clinician-dashboard";
import { PatientDashboard } from "@/components/dashboard/patient-dashboard";
import * as sessionService from "@/lib/services/session.service";
import { startOfWeek, endOfWeek } from "date-fns";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);

  if (user.role === "CLINICIAN") {
    const [
      patientCount,
      activePlans,
      pendingFeedback,
      unreadMessages,
      recentFeedback,
      activePrograms,
      upcomingSessions,
    ] = await Promise.all([
      prisma.patientClinicianLink.count({
        where: { clinicianId: user.id, status: "active" },
      }),
      prisma.workoutPlan.count({
        where: { createdById: user.id, status: "ACTIVE" },
      }),
      prisma.exerciseFeedback.count({
        where: {
          clinicianResponse: null,
          planExercise: { plan: { createdById: user.id } },
        },
      }),
      prisma.message.count({
        where: { recipientId: user.id, isRead: false },
      }),
      prisma.exerciseFeedback.findMany({
        where: { planExercise: { plan: { createdById: user.id } } },
        include: {
          planExercise: { include: { exercise: true } },
          patient: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.program.count({
        where: { clinicianId: user.id, status: "ACTIVE" },
      }),
      sessionService.getSessionsForClinician(user.id, {
        from: weekStart,
        to: weekEnd,
      }),
    ]);

    return (
      <ClinicianDashboard
        patientCount={patientCount}
        activePlans={activePlans}
        pendingFeedback={pendingFeedback}
        unreadMessages={unreadMessages}
        recentFeedback={recentFeedback}
        lowAdherencePatients={[]}
        activePrograms={activePrograms}
        upcomingSessions={upcomingSessions}
      />
    );
  }

  // Patient dashboard
  const [recentAssessments, unreadMessages, upcomingSessions, completedThisWeek] = await Promise.all([
    prisma.assessment.findMany({
      where: { patientId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.message.count({ where: { recipientId: user.id, isRead: false } }),
    prisma.workoutSessionV2.findMany({
      where: {
        patientId: user.id,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      },
      include: {
        workout: true
      },
      orderBy: { scheduledDate: "asc" },
      take: 5,
    }),
    prisma.workoutSessionV2.count({
      where: {
        patientId: user.id,
        status: "COMPLETED",
        completedAt: { gte: weekStart, lte: weekEnd }
      }
    })
  ]);

  return (
    <PatientDashboard
      upcomingSessions={upcomingSessions}
      weeklyCompliance={completedThisWeek}
      recentAssessments={recentAssessments}
      unreadMessages={unreadMessages}
    />
  );
}
