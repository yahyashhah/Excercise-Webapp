import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  MessageSquare,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Library,
  CalendarDays,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";
import { formatFeedbackRating, formatRelativeTime, formatSessionStatus } from "@/lib/utils/formatting";
import { format } from "date-fns";

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
  lowAdherencePatients: {
    id: string;
    firstName: string;
    lastName: string;
    complianceRate: number;
  }[];
  activePrograms?: number;
  upcomingSessions?: {
    id: string;
    scheduledDate: Date;
    status: string;
    patient?: { id: string; firstName: string; lastName: string } | null;
    workout?: {
      program?: { id: string; name: string } | null;
    } | null;
  }[];
}

const statCards = (
  patientCount: number,
  activePrograms: number,
  pendingFeedback: number,
  unreadMessages: number,
) => [
  {
    label: "Active Clients",
    value: patientCount,
    icon: Users,
    href: "/patients",
    gradient: "from-blue-500 to-indigo-600",
    bg: "bg-blue-50",
    iconColor: "text-blue-600",
    trend: "+2 this week",
  },
  {
    label: "Active Programs",
    value: activePrograms,
    icon: Library,
    href: "/programs",
    gradient: "from-emerald-500 to-teal-600",
    bg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    trend: "Running now",
  },
  {
    label: "Pending Feedback",
    value: pendingFeedback,
    icon: AlertCircle,
    href: "/dashboard",
    gradient: "from-amber-500 to-orange-600",
    bg: "bg-amber-50",
    iconColor: "text-amber-600",
    trend: pendingFeedback > 0 ? "Needs attention" : "All reviewed",
  },
  {
    label: "Unread Messages",
    value: unreadMessages,
    icon: MessageSquare,
    href: "/messages",
    gradient: "from-violet-500 to-purple-600",
    bg: "bg-violet-50",
    iconColor: "text-violet-600",
    trend: unreadMessages > 0 ? "New messages" : "All read",
  },
];

const feedbackColors: Record<string, string> = {
  FELT_GOOD: "bg-emerald-100 text-emerald-700 border-emerald-200",
  MILD_DISCOMFORT: "bg-amber-100 text-amber-700 border-amber-200",
  PAINFUL: "bg-red-100 text-red-700 border-red-200",
  UNSURE_HOW_TO_PERFORM: "bg-blue-100 text-blue-700 border-blue-200",
};

const sessionStatusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  MISSED: "bg-red-100 text-red-700",
};

export function ClinicianDashboard({
  patientCount,
  pendingFeedback,
  unreadMessages,
  recentFeedback,
  activePrograms = 0,
  upcomingSessions = [],
}: ClinicianDashboardProps) {
  const cards = statCards(patientCount, activePrograms, pendingFeedback, unreadMessages);

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Good morning 👋</h1>
          <p className="mt-1 text-muted-foreground">
            Here&apos;s what&apos;s happening with your clients today.
          </p>
        </div>
        <Button
          className="shrink-0 bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-indigo-600 hover:shadow-blue-500/35 transition-all"
          asChild
        >
          <Link href="/programs/generate">
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Program
          </Link>
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href}>
              <Card className="group border-0 shadow-sm ring-1 ring-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-border">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className={`rounded-xl p-2.5 ${card.bg}`}>
                      <Icon className={`h-5 w-5 ${card.iconColor}`} />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition-all duration-150 group-hover:text-muted-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                  <div className="mt-4">
                    <p className="text-3xl font-bold tracking-tight">{card.value}</p>
                    <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground/70">
                      <TrendingUp className="h-3 w-3" />
                      {card.trend}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* This Week's Sessions – wider */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4.5 w-4.5 text-primary" />
              <CardTitle className="text-base font-semibold">This Week&apos;s Sessions</CardTitle>
            </div>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground" asChild>
              <Link href="/programs">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {upcomingSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CalendarDays className="h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm font-medium text-muted-foreground">No sessions this week</p>
                <p className="mt-1 text-xs text-muted-foreground/60">Assign programs to your clients to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingSessions.slice(0, 8).map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  >
                    {/* Patient avatar */}
                    {session.patient && (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-400 to-indigo-500 text-xs font-bold text-white">
                        {session.patient.firstName[0]}{session.patient.lastName[0]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {session.workout?.program?.name || "Workout"}
                      </p>
                      {session.patient && (
                        <p className="text-xs text-muted-foreground">
                          {session.patient.firstName} {session.patient.lastName}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(session.scheduledDate), "EEE, MMM d")}
                      </span>
                      <Badge
                        className={`text-xs font-medium border-0 ${sessionStatusColors[session.status] || "bg-muted text-muted-foreground"}`}
                      >
                        {formatSessionStatus(session.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Feedback – narrower */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Recent Feedback</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground" asChild>
              <Link href="/dashboard">
                All <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentFeedback.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm font-medium text-muted-foreground">No feedback yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentFeedback.map((fb) => (
                  <div
                    key={fb.id}
                    className="rounded-xl border border-border/60 p-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {fb.patient.firstName} {fb.patient.lastName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {fb.planExercise.exercise.name}
                        </p>
                      </div>
                      <Badge
                        className={`shrink-0 border text-[10px] font-semibold ${feedbackColors[fb.rating] || "bg-muted text-muted-foreground border-border"}`}
                      >
                        {formatFeedbackRating(fb.rating)}
                      </Badge>
                    </div>
                    {fb.comment && (
                      <p className="mt-2 line-clamp-2 text-xs italic text-muted-foreground/80">
                        &ldquo;{fb.comment}&rdquo;
                      </p>
                    )}
                    <p className="mt-1.5 text-[10px] text-muted-foreground/50">
                      {formatRelativeTime(fb.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
