import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ClipboardList, Activity, MessageSquare, TrendingUp, Play, Flame } from "lucide-react";
import { formatPlanStatus, formatDate } from "@/lib/utils/formatting";

interface PatientDashboardProps {
  upcomingSessions: any[];
  weeklyCompliance: number;
  recentAssessments: { id: string; assessmentType: string; value: number; unit: string; createdAt: Date }[];
  unreadMessages: number;
}

export function PatientDashboard({
  upcomingSessions,
  weeklyCompliance,
  recentAssessments,
  unreadMessages,
}: PatientDashboardProps) {
  const compliancePercent = Math.min(Math.round((weeklyCompliance / 7) * 100), 100);
  
  const nextWorkout = upcomingSessions.length > 0 ? upcomingSessions[0] : null;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold">Your Dashboard</h2>
        <p className="text-muted-foreground">Track your progress and stay on top of your exercises.</p>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-xl bg-white/20 p-3">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{upcomingSessions.length}</p>        
              <p className="text-sm text-white/80">Upcoming</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-xl bg-white/20 p-3">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{weeklyCompliance}</p>
              <p className="text-sm text-white/80">Sessions This Week</p>       
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-violet-500 to-purple-600 text-white">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-xl bg-white/20 p-3">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{unreadMessages}</p>
              <p className="text-sm text-white/80">Unread Messages</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-amber-500 to-orange-600 text-white">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-xl bg-white/20 p-3">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{recentAssessments.length}</p>  
              <p className="text-sm text-white/80">Assessments</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly compliance progress */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-amber-500" />
              <p className="text-sm font-semibold">Weekly Progress</p>
            </div>
            <p className="text-sm font-bold text-primary">{compliancePercent}%</p>
          </div>
          <Progress value={compliancePercent} className="h-3" />
          <p className="mt-2 text-xs text-muted-foreground">
            {weeklyCompliance} of 7 sessions completed this week
          </p>
        </CardContent>
      </Card>

      {/* Next workout */}
      {nextWorkout && (
        <Card className="overflow-hidden border-0 bg-gradient-to-r from-blue-50 via-indigo-50 to-violet-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-violet-900/20">
          <CardContent className="flex items-center justify-between p-6">       
            <div>
              <Badge className="mb-2 bg-blue-100 text-blue-700 hover:bg-blue-200 border-0">
                {formatDate(nextWorkout.scheduledDate)}
              </Badge>
              <p className="text-lg font-semibold">{nextWorkout.workout?.name || "Workout Session"}</p> 
              <p className="text-sm text-muted-foreground">Ready when you are</p>
            </div>
            <Button className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 border-0" asChild>
              <Link href={"/sessions/" + nextWorkout.id}>     
                <Play className="mr-2 h-4 w-4" />
                Start Workout
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active plans */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No upcoming sessions. Great job catching up!
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingSessions.map((session) => (
                <Link
                  key={session.id}
                  href={"/sessions/" + session.id}
                  className="flex items-center justify-between rounded-xl border border-border p-4 transition-all hover:bg-muted/50 hover:shadow-sm"
                >
                  <div>
                    <p className="font-medium">{session.workout?.name || "Workout Session"}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(session.scheduledDate)}</p>
                  </div>
                  <Badge variant="secondary">{formatPlanStatus(session.status)}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
