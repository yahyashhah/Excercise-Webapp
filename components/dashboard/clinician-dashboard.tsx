import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, ClipboardList, MessageSquare, AlertCircle, Sparkles, ChevronRight } from "lucide-react";
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

const statGradients = [
  "bg-gradient-to-br from-blue-500 to-indigo-600",
  "bg-gradient-to-br from-emerald-500 to-teal-600",
  "bg-gradient-to-br from-amber-500 to-orange-600",
  "bg-gradient-to-br from-violet-500 to-purple-600",
];

export function ClinicianDashboard({
  patientCount,
  activePlans,
  pendingFeedback,
  unreadMessages,
  recentFeedback,
}: ClinicianDashboardProps) {
  const stats = [
    { label: "Active Patients", value: patientCount, icon: Users, href: "/patients" },
    { label: "Active Plans", value: activePlans, icon: ClipboardList, href: "/workout-plans" },
    { label: "Pending Feedback", value: pendingFeedback, icon: AlertCircle, href: "/dashboard" },
    { label: "Unread Messages", value: unreadMessages, icon: MessageSquare, href: "/messages" },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome + action */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Welcome back</h2>
          <p className="text-muted-foreground">Here is what is happening with your patients today.</p>
        </div>
        <Button className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 border-0" asChild>
          <Link href="/workout-plans/generate">
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Plan
          </Link>
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="transition-all hover:shadow-md hover:-translate-y-0.5">
                <CardContent className="flex items-center gap-4 p-6">
                  <div className={`rounded-xl p-3 text-white ${statGradients[idx]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Recent feedback */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Patient Feedback</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              View all <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentFeedback.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent feedback.</p>
          ) : (
            <div className="space-y-3">
              {recentFeedback.map((fb) => (
                <div
                  key={fb.id}
                  className="flex items-start justify-between rounded-xl border border-border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {fb.patient.firstName} {fb.patient.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {fb.planExercise.exercise.name}
                    </p>
                    {fb.comment && (
                      <p className="text-sm text-muted-foreground/80 italic">&ldquo;{fb.comment}&rdquo;</p>
                    )}
                  </div>
                  <div className="text-right">
                    <Badge
                      variant={fb.rating === "PAINFUL" ? "destructive" : "secondary"}
                      className={
                        fb.rating === "FELT_GOOD"
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          : fb.rating === "TOO_EASY"
                            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                            : fb.rating === "TOO_HARD"
                              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                              : undefined
                      }
                    >
                      {formatFeedbackRating(fb.rating)}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatRelativeTime(fb.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
