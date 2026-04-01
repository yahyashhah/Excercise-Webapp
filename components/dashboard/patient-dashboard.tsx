import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ClipboardList, Activity, MessageSquare, TrendingUp, Play, Flame, ChevronRight, BarChart3 } from "lucide-react";
import { formatPlanStatus, formatDate } from "@/lib/utils/formatting";

interface PatientDashboardProps {
  activePlans: { id: string; title: string; status: string; exerciseCount: number }[];
  weeklyCompliance: number;
  nextWorkout: { plan: { id: string; title: string }; dayLabel: string } | null;
  recentAssessments: { id: string; assessmentType: string; value: number; unit: string; createdAt: Date }[];
  unreadMessages: number;
}

export function PatientDashboard({
  activePlans,
  weeklyCompliance,
  nextWorkout,
  recentAssessments,
  unreadMessages,
}: PatientDashboardProps) {
  const compliancePercent = Math.min(Math.round((weeklyCompliance / 7) * 100), 100);

  const statCards = [
    {
      label: "Active Plans",
      value: activePlans.length,
      icon: ClipboardList,
      href: "/workout-plans",
      from: "from-blue-500",
      to: "to-indigo-600",
    },
    {
      label: "This Week",
      value: weeklyCompliance,
      suffix: "sessions",
      icon: Activity,
      href: "/workout-plans",
      from: "from-emerald-500",
      to: "to-teal-600",
    },
    {
      label: "Messages",
      value: unreadMessages,
      suffix: "unread",
      icon: MessageSquare,
      href: "/messages",
      from: "from-violet-500",
      to: "to-purple-600",
    },
    {
      label: "Assessments",
      value: recentAssessments.length,
      icon: TrendingUp,
      href: "/assessments",
      from: "from-amber-500",
      to: "to-orange-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Your Dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Track your progress and stay on top of your exercises.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href} className="group block">
              <Card className={`border-0 bg-linear-to-br ${s.from} ${s.to} text-white transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5`}>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="rounded-xl bg-white/20 p-3 shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold tabular-nums leading-none">
                      {s.value}
                    </p>
                    <p className="text-xs text-white/80 mt-0.5">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Weekly progress */}
      <Card className="border-border/60">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
                <Flame className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Weekly Progress</p>
                <p className="text-xs text-muted-foreground">
                  {weeklyCompliance} of 7 sessions this week
                </p>
              </div>
            </div>
            <span className={`text-xl font-bold tabular-nums ${compliancePercent >= 80 ? "text-emerald-600" : compliancePercent >= 50 ? "text-amber-600" : "text-muted-foreground"}`}>
              {compliancePercent}%
            </span>
          </div>
          <Progress value={compliancePercent} className="h-2.5" />
        </CardContent>
      </Card>

      {/* Next workout CTA */}
      {nextWorkout && (
        <div className="relative overflow-hidden rounded-xl border-0 bg-linear-to-r from-blue-600 via-indigo-600 to-violet-600 p-5 text-white shadow-md">
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute -bottom-4 right-12 h-20 w-20 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <Badge className="mb-2 border-white/30 bg-white/20 text-white text-xs hover:bg-white/30">
                {nextWorkout.dayLabel}
              </Badge>
              <p className="text-lg font-bold leading-tight">{nextWorkout.plan.title}</p>
              <p className="mt-0.5 text-sm text-white/70">Ready when you are</p>
            </div>
            <Button
              className="shrink-0 bg-white text-indigo-700 hover:bg-white/90 border-0 font-semibold shadow-sm"
              asChild
            >
              <Link href={`/workout-plans/${nextWorkout.plan.id}/session`}>
                <Play className="mr-2 h-4 w-4 fill-indigo-700" />
                Start
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Active plans */}
      <Card className="border-border/60">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Your Plans</CardTitle>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" asChild>
            <Link href="/workout-plans">
              View all <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {activePlans.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No active plans yet. Your clinician will assign one soon.
            </p>
          ) : (
            <div className="space-y-2">
              {activePlans.map((plan) => (
                <Link
                  key={plan.id}
                  href={`/workout-plans/${plan.id}`}
                  className="group flex items-center justify-between rounded-lg border border-border/60 p-3.5 transition-all hover:bg-muted/40 hover:border-primary/20"
                >
                  <div>
                    <p className="text-sm font-semibold group-hover:text-primary transition-colors">
                      {plan.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{plan.exerciseCount} exercises</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">{formatPlanStatus(plan.status)}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent assessments */}
      {recentAssessments.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Recent Assessments</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" asChild>
              <Link href="/assessments">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentAssessments.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 text-primary shrink-0">
                      <BarChart3 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium capitalize">{a.assessmentType.replace(/_/g, " ").toLowerCase()}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</p>
                    </div>
                  </div>
                  <p className="text-base font-bold text-primary tabular-nums">
                    {a.value}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">{a.unit}</span>
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
