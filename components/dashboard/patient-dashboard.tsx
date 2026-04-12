import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ClipboardList,
  Activity,
  MessageSquare,
  TrendingUp,
  Play,
  Flame,
  ChevronRight,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { formatSessionStatus, formatDate } from "@/lib/utils/formatting";

interface PatientDashboardProps {
  upcomingSessions: {
    id: string;
    scheduledDate: Date;
    status: string;
    workout?: { name?: string | null } | null;
  }[];
  weeklyCompliance: number;
  recentAssessments: { id: string; assessmentType: string; value: number; unit: string; createdAt: Date }[];
  unreadMessages: number;
}

const sessionStatusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  MISSED: "bg-red-100 text-red-700",
};

export function PatientDashboard({
  upcomingSessions,
  weeklyCompliance,
  recentAssessments,
  unreadMessages,
}: PatientDashboardProps) {
  const totalWeekSessions = weeklyCompliance + upcomingSessions.length;
  const compliancePercent = totalWeekSessions > 0
    ? Math.min(Math.round((weeklyCompliance / totalWeekSessions) * 100), 100)
    : 0;

  const nextWorkout = upcomingSessions.length > 0 ? upcomingSessions[0] : null;

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Stay on track with your exercises and progress.</p>
      </div>

      {/* Next workout hero — only when there's a session */}
      {nextWorkout && (
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-blue-600 via-indigo-600 to-violet-600 p-6 text-white shadow-xl shadow-blue-500/25">
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Badge className="mb-3 border-white/20 bg-white/15 text-white text-xs font-medium backdrop-blur-sm">
                <Calendar className="mr-1 h-3 w-3" />
                {formatDate(nextWorkout.scheduledDate)}
              </Badge>
              <h2 className="text-xl font-bold">
                {nextWorkout.workout?.name || "Workout Session"}
              </h2>
              <p className="mt-1 text-sm text-blue-200">Ready when you are — let&apos;s go!</p>
            </div>
            <Button
              size="lg"
              className="shrink-0 bg-white font-semibold text-blue-700 shadow-lg hover:bg-blue-50 border-0"
              asChild
            >
              <Link href={`/sessions/${nextWorkout.id}`}>
                <Play className="mr-2 h-4 w-4 fill-current" />
                Start Workout
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Upcoming Sessions",
            value: upcomingSessions.length,
            icon: ClipboardList,
            color: "text-blue-600",
            bg: "bg-blue-50",
            href: "#sessions",
          },
          {
            label: "Completed This Week",
            value: weeklyCompliance,
            icon: CheckCircle2,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
            href: "#sessions",
          },
          {
            label: "Unread Messages",
            value: unreadMessages,
            icon: MessageSquare,
            color: "text-violet-600",
            bg: "bg-violet-50",
            href: "/messages",
          },
          {
            label: "Assessments",
            value: recentAssessments.length,
            icon: TrendingUp,
            color: "text-amber-600",
            bg: "bg-amber-50",
            href: "/assessments",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          const content = (
            <Card className="group border-0 ring-1 ring-border/50 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-border">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`rounded-xl p-2.5 ${stat.bg}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{stat.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          );
          return stat.href.startsWith("/") ? (
            <Link key={stat.label} href={stat.href}>{content}</Link>
          ) : (
            <div key={stat.label}>{content}</div>
          );
        })}
      </div>

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

      {/* Upcoming sessions list */}
      {upcomingSessions.length > 0 && (
        <Card id="sessions">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4.5 w-4.5 text-primary" />
              <CardTitle className="text-base font-semibold">Upcoming Sessions</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingSessions.map((session, i) => (
                <Link
                  key={session.id}
                  href={`/sessions/${session.id}`}
                  className="group flex items-center gap-4 rounded-xl border border-border/60 bg-muted/20 p-4 transition-all hover:bg-muted/50 hover:border-border"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium group-hover:text-primary transition-colors">
                      {session.workout?.name || "Workout Session"}
                    </p>
                    <p className="text-sm text-muted-foreground">{formatDate(session.scheduledDate)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      className={`border-0 text-xs font-medium ${sessionStatusColors[session.status] || "bg-muted text-muted-foreground"}`}
                    >
                      {formatSessionStatus(session.status)}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
