import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { ClinicianDashboard } from "@/components/dashboard/clinician-dashboard";
import { PatientDashboard } from "@/components/dashboard/patient-dashboard";
import * as sessionService from "@/lib/services/session.service";
import { startOfWeek, endOfWeek, startOfDay } from "date-fns";

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
  const calendarStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const calendarEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);

  const [recentAssessments, unreadMessages, calendarSessions, completedThisWeek] = await Promise.all([
    prisma.assessment.findMany({
      where: { patientId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.message.count({ where: { recipientId: user.id, isRead: false } }),
    prisma.workoutSessionV2.findMany({
      where: {
        patientId: user.id,
        scheduledDate: { gte: calendarStart, lte: calendarEnd },
      },
      select: {
        id: true,
        scheduledDate: true,
        status: true,
        workout: {
          select: {
            name: true,
            blocks: {
              select: {
                exercises: { select: { id: true } },
              },
            },
          },
        },
      },
      orderBy: { scheduledDate: "asc" },
    }),
    prisma.workoutSessionV2.count({
      where: {
        patientId: user.id,
        status: "COMPLETED",
        completedAt: { gte: weekStart, lte: weekEnd },
      },
    }),
  ]);

  // The hero "next workout" uses the first upcoming session
  const upcomingSessions = calendarSessions.filter(
    (s) => (s.status === "SCHEDULED" || s.status === "IN_PROGRESS") && new Date(s.scheduledDate) >= startOfDay(now)
  );

  return (
    <PatientDashboard
      upcomingSessions={upcomingSessions as any}
      calendarSessions={calendarSessions as any}
      weeklyCompliance={completedThisWeek}
      recentAssessments={recentAssessments}
      unreadMessages={unreadMessages}
    />
  );
}
