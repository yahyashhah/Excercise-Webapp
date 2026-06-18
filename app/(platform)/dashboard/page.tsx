import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { TrainerDashboard } from "@/components/dashboard/trainer-dashboard";
import { ClientDashboard } from "@/components/dashboard/client-dashboard";
import * as sessionService from "@/lib/services/session.service";
import { getClientIdsForTrainer } from "@/lib/services/client.service";
import { startOfWeek, endOfWeek, startOfDay } from "date-fns";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);

  if (user.role === "TRAINER") {
    const [
      clientIds,
      activePlans,
      pendingFeedback,
      unreadMessages,
      recentFeedback,
      activePrograms,
      upcomingSessions,
    ] = await Promise.all([
      getClientIdsForTrainer(user.id),
      prisma.workoutPlan.count({
        where: { createdById: user.id, status: "ACTIVE" },
      }),
      prisma.exerciseFeedback.count({
        where: {
          trainerResponse: null,
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
          client: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.program.count({
        where: { trainerId: user.id, status: "ACTIVE" },
      }),
      sessionService.getSessionsForTrainer(user.id, {
        from: weekStart,
        to: weekEnd,
      }),
    ]);

    return (
      <TrainerDashboard
        clientCount={clientIds.length}
        activePlans={activePlans}
        pendingFeedback={pendingFeedback}
        unreadMessages={unreadMessages}
        recentFeedback={recentFeedback}
        lowAdherenceClients={[]}
        activePrograms={activePrograms}
        upcomingSessions={upcomingSessions}
      />
    );
  }

  // Client dashboard
  const calendarStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const calendarEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);

  const [recentAssessments, unreadMessages, calendarSessions, completedThisWeek] = await Promise.all([
    prisma.assessment.findMany({
      where: { clientId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.message.count({ where: { recipientId: user.id, isRead: false } }),
    prisma.workoutSessionV2.findMany({
      where: {
        clientId: user.id,
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
        clientId: user.id,
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
    <ClientDashboard
      upcomingSessions={upcomingSessions as any}
      calendarSessions={calendarSessions as any}
      weeklyCompliance={completedThisWeek}
      recentAssessments={recentAssessments}
      unreadMessages={unreadMessages}
    />
  );
}
