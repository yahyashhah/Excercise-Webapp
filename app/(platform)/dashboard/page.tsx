import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { ClinicianDashboard } from "@/components/dashboard/clinician-dashboard";
import { PatientDashboard } from "@/components/dashboard/patient-dashboard";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (user.role === "CLINICIAN") {
    const [patientCount, activePlans, pendingFeedback, unreadMessages, recentFeedback] =
      await Promise.all([
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
      ]);

    return (
      <ClinicianDashboard
        patientCount={patientCount}
        activePlans={activePlans}
        pendingFeedback={pendingFeedback}
        unreadMessages={unreadMessages}
        recentFeedback={recentFeedback}
        lowAdherencePatients={[]}
      />
    );
  }

  // Patient dashboard
  const [activePlans, sessions, recentAssessments, unreadMessages] = await Promise.all([
    prisma.workoutPlan.findMany({
      where: { patientId: user.id, status: "ACTIVE" },
      include: { _count: { select: { exercises: true } } },
    }),
    prisma.workoutSession.findMany({
      where: { patientId: user.id, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 10,
    }),
    prisma.assessment.findMany({
      where: { patientId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.message.count({ where: { recipientId: user.id, isRead: false } }),
  ]);

  const weeklyCompliance = sessions.filter((s) => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return s.completedAt && s.completedAt > weekAgo;
  }).length;

  return (
    <PatientDashboard
      activePlans={activePlans.map((p) => ({
        ...p,
        exerciseCount: p._count.exercises,
      }))}
      weeklyCompliance={weeklyCompliance}
      nextWorkout={
        activePlans.length > 0 ? { plan: activePlans[0], dayLabel: "Today" } : null
      }
      recentAssessments={recentAssessments}
      unreadMessages={unreadMessages}
    />
  );
}
