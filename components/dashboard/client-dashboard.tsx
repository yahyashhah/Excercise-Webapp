import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp,
  Play,
  Flame,
  ChevronRight,
  Calendar,
  CalendarX,
} from "lucide-react";
import { formatDate } from "@/lib/utils/formatting";
import { ClientSessionCalendar } from "./client-session-calendar";

const MOTIVATIONAL_QUOTES = [
  "Small steps every day add up to big results.",
  "Consistency beats intensity — showing up is the win.",
  "Your body can do it. It's your mind you need to convince.",
  "Recovery is progress too.",
  "Every rep brings you closer to where you want to be.",
  "Rest today, come back stronger tomorrow.",
  "Progress, not perfection.",
];

function isSameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface ClientDashboardProps {
  firstName: string;
  upcomingSessions: {
    id: string;
    scheduledDate: Date;
    status: string;
    workout?: { name?: string | null } | null;
  }[];
  calendarSessions: {
    id: string;
    scheduledDate: Date;
    status: string;
    workout: {
      name: string | null;
      blocks: { exercises: { id: string }[] }[];
    } | null;
  }[];
  weeklyCompliance: number;
  recentAssessments: { id: string; assessmentType: string; value: number; unit: string; createdAt: Date }[];
  currentStreak: number;
  exercisesCompleted: number;
  minutesExercised: number;
}

export function ClientDashboard({
  firstName,
  upcomingSessions,
  calendarSessions,
  weeklyCompliance,
  recentAssessments,
  currentStreak,
  exercisesCompleted,
  minutesExercised,
}: ClientDashboardProps) {
  const totalWeekSessions = weeklyCompliance + upcomingSessions.length;
  const compliancePercent = totalWeekSessions > 0
    ? Math.min(Math.round((weeklyCompliance / totalWeekSessions) * 100), 100)
    : 0;

  const today = new Date();
  const todayWorkout = upcomingSessions.find((s) => isSameLocalDay(new Date(s.scheduledDate), today)) ?? null;
  const nextFutureSession = !todayWorkout && upcomingSessions.length > 0 ? upcomingSessions[0] : null;
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
  const quote = MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length];

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome Back, {firstName}!</h1>
        <p className="mt-1 text-muted-foreground">Stay on track with your exercises and progress.</p>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Current Streak", value: `${currentStreak} ${currentStreak === 1 ? "day" : "days"}`, emoji: "🔥", bg: "bg-amber-50" },
          { label: "Exercises Completed", value: exercisesCompleted, emoji: "💪", bg: "bg-emerald-50" },
          { label: "Minutes Exercised", value: minutesExercised, emoji: "⏱", bg: "bg-blue-50" },
        ].map((stat) => (
          <Card key={stat.label} className="border-0 ring-1 ring-border/50 shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${stat.bg}`}>
                {stat.emoji}
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today's workout hero */}
      {todayWorkout ? (
        <div className="relative overflow-hidden rounded-2xl bg-muted p-6 shadow-sm">
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Badge className="mb-3 border-border bg-background text-foreground text-xs font-medium">
                <Calendar className="mr-1 h-3 w-3" />
                {formatDate(todayWorkout.scheduledDate)}
              </Badge>
              <h2 className="text-xl font-bold text-foreground">
                {todayWorkout.workout?.name || "Workout Session"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Ready when you are — let&apos;s go!</p>
            </div>
            <Button
              size="lg"
              className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-lg border-0"
              asChild
            >
              <Link href={`/sessions/${todayWorkout.id}`}>
                <Play className="mr-2 h-4 w-4 fill-current" />
                Start Workout
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl bg-muted p-6 shadow-sm text-center">
          <CalendarX className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <h2 className="text-lg font-bold text-foreground">
            No Workouts for Today
            {nextFutureSession && (
              <span className="font-medium text-muted-foreground">
                {" "}(next session {formatDate(nextFutureSession.scheduledDate)})
              </span>
            )}
          </h2>
          <p className="mt-2 text-xs text-muted-foreground italic">{quote}</p>
        </div>
      )}

      {/* Weekly Progress */}
      <Card>
        <CardContent className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                <Flame className="h-4.5 w-4.5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">Weekly Progress</p>
                <p className="text-xs text-muted-foreground">
                  {weeklyCompliance} of {totalWeekSessions} sessions completed
                </p>
              </div>
            </div>
            <span className="text-2xl font-bold text-primary">{compliancePercent}%</span>
          </div>
          <Progress value={compliancePercent} className="h-2.5" />
          <div className="mt-3 flex justify-between text-xs text-muted-foreground/60">
            <span>Keep it up!</span>
            <span>{totalWeekSessions - weeklyCompliance} remaining</span>
          </div>
        </CardContent>
      </Card>

      {/* Schedule calendar */}
      <ClientSessionCalendar sessions={calendarSessions} />

      {/* Recent Assessments */}
      {recentAssessments.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4.5 w-4.5 text-primary" />
              <CardTitle className="text-base font-semibold">Recent Assessments</CardTitle>
            </div>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" asChild>
              <Link href="/assessments">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentAssessments.slice(0, 4).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-xl border border-border/60 p-3"
                >
                  <p className="text-sm font-medium capitalize">
                    {a.assessmentType.replace(/_/g, " ")}
                  </p>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-bold text-primary">
                      {a.value} <span className="font-normal text-muted-foreground">{a.unit}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
