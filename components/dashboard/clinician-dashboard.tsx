import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, ClipboardList, MessageSquare, AlertCircle, Sparkles, ChevronRight, TrendingUp } from "lucide-react";
import { formatFeedbackRating, formatRelativeTime } from "@/lib/utils/formatting";

interface ClinicianDashboardProps {
  patientCount: number;
  activePlans: number;
  pendingFeedback: number;
  unreadMessages: number;
  recentFeedback: {
    id: string;
    rating: string;
    comment: string | null;
    createdAt: Date;
    patient: { firstName: string; lastName: string };
    planExercise: { exercise: { name: string } };
  }[];
  lowAdherencePatients: { id: string; firstName: string; lastName: string; complianceRate: number }[];
}

const stats = [
  {
    key: "patients",
    icon: Users,
    gradient: "from-blue-500 to-indigo-600",
    bg: "bg-blue-50",
    text: "text-blue-600",
    href: "/patients",
  },
  {
    key: "plans",
    icon: ClipboardList,
    gradient: "from-emerald-500 to-teal-600",
    bg: "bg-emerald-50",
    text: "text-emerald-600",
    href: "/workout-plans",
  },
  {
    key: "feedback",
    icon: AlertCircle,
    gradient: "from-amber-500 to-orange-600",
    bg: "bg-amber-50",
    text: "text-amber-600",
    href: "/dashboard",
  },
  {
    key: "messages",
    icon: MessageSquare,
    gradient: "from-violet-500 to-purple-600",
    bg: "bg-violet-50",
    text: "text-violet-600",
    href: "/messages",
  },
];

const ratingConfig: Record<string, { className: string }> = {
  FELT_GOOD: { className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  MILD_DISCOMFORT: { className: "bg-amber-50 text-amber-700 border-amber-200" },
  PAINFUL: { className: "bg-red-50 text-red-700 border-red-200" },
  UNSURE_HOW_TO_PERFORM: { className: "bg-blue-50 text-blue-700 border-blue-200" },
};

export function ClinicianDashboard({
  patientCount,
  activePlans,
  pendingFeedback,
  unreadMessages,
  recentFeedback,
}: ClinicianDashboardProps) {
  const values = [patientCount, activePlans, pendingFeedback, unreadMessages];
  const labels = ["Active Clients", "Active Plans", "Pending Feedback", "Unread Messages"];

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening with your clients today.
          </p>
        </div>
        <Button className="shrink-0 bg-linear-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 border-0 shadow-sm" asChild>
          <Link href="/workout-plans/generate">
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Plan
          </Link>
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, idx) => {
          const Icon = s.icon;
          return (
            <Link key={s.key} href={s.href} className="group block">
              <Card className="border-border/60 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 overflow-hidden">
                <div className={`h-1 w-full bg-linear-to-r ${s.gradient}`} />
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`rounded-xl p-3 ${s.bg} ${s.text} shrink-0`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums">{values[idx]}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{labels[idx]}</p>
                  </div>
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "View Clients", href: "/patients", icon: Users, desc: "Manage your client list" },
          { label: "All Plans", href: "/workout-plans", icon: ClipboardList, desc: "Review workout programs" },
          { label: "Assessments", href: "/assessments", icon: TrendingUp, desc: "Track client progress" },
        ].map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href} className="group">
              <Card className="border-border/60 transition-all duration-200 hover:shadow-sm hover:border-primary/20">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted group-hover:bg-primary/8 transition-colors">
                    <Icon className="h-4.5 w-4.5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold group-hover:text-primary transition-colors">{action.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{action.desc}</p>
                  </div>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Recent feedback */}
      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">Recent Patient Feedback</CardTitle>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground" asChild>
            <Link href="/dashboard">
              View all <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentFeedback.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">No recent feedback from patients.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentFeedback.map((fb) => {
                const config = ratingConfig[fb.rating];
                return (
                  <div
                    key={fb.id}
                    className="flex items-start justify-between gap-4 rounded-xl border border-border/60 p-4 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-semibold">
                        {fb.patient.firstName} {fb.patient.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fb.planExercise.exercise.name}
                      </p>
                      {fb.comment && (
                        <p className="text-xs text-muted-foreground/80 italic line-clamp-1">
                          &ldquo;{fb.comment}&rdquo;
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge
                        variant="outline"
                        className={`text-xs border ${config?.className ?? ""}`}
                      >
                        {formatFeedbackRating(fb.rating)}
                      </Badge>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatRelativeTime(fb.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
