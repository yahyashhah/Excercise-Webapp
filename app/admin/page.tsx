import { getPlatformStats, getRecentUsers, getTopClinicians } from "@/lib/services/admin.service";
import { StatCard } from "@/components/admin/stat-card";
import { Users, UserCheck, User, Dumbbell, Library, Activity, TrendingUp, Zap } from "lucide-react";
import { format } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default async function AdminOverviewPage() {
  const [stats, recentUsers, topClinicians] = await Promise.all([
    getPlatformStats(),
    getRecentUsers(8),
    getTopClinicians(5),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Overview</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Real-time snapshot of all activity across the INMOTUS RX platform.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total Users"     value={stats.totalUsers.toLocaleString()}   sub={`+${stats.newUsersThisMonth} this month`} icon={Users}      color="primary" />
        <StatCard label="Clinicians"      value={stats.clinicians.toLocaleString()}                                                   icon={UserCheck}  color="blue" />
        <StatCard label="Patients"        value={stats.patients.toLocaleString()}                                                     icon={User}       color="cyan" />
        <StatCard label="Active Programs" value={stats.activePrograms.toLocaleString()} sub={`${stats.totalPrograms.toLocaleString()} total`}           icon={TrendingUp} color="emerald" />
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Exercises"          value={stats.totalExercises.toLocaleString()} sub="In library"  icon={Dumbbell}  color="amber" />
        <StatCard label="Total Programs"     value={stats.totalPrograms.toLocaleString()}                    icon={Library}   color="rose" />
        <StatCard label="Sessions Completed" value={stats.totalSessions.toLocaleString()}                    icon={Activity}  color="emerald" />
        <StatCard label="New This Month"     value={stats.newUsersThisMonth.toLocaleString()} sub="Signups"  icon={Zap}       color="primary" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent signups */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">Recent Sign-ups</h2>
            <Link href="/admin/users" className="text-xs text-primary hover:text-primary/80 transition-colors">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted overflow-hidden">
                  {u.imageUrl ? (
                    <Image src={u.imageUrl} alt="" fill className="object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-muted-foreground">
                      {u.firstName[0]}{u.lastName[0]}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {u.firstName} {u.lastName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge
                    variant="outline"
                    className={
                      u.role === "CLINICIAN"
                        ? "border-blue-500/30 bg-blue-500/10 text-blue-600 text-[10px]"
                        : "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 text-[10px]"
                    }
                  >
                    {u.role === "CLINICIAN" ? "Clinician" : "Patient"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground/60">
                    {format(new Date(u.createdAt), "MMM d")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top clinicians */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">Top Clinicians</h2>
            <span className="text-xs text-muted-foreground">by patient count</span>
          </div>
          <div className="divide-y divide-border">
            {topClinicians.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted overflow-hidden">
                  {c.imageUrl ? (
                    <Image src={c.imageUrl} alt="" fill className="object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-muted-foreground">{c.name.charAt(0)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <p className="text-sm font-bold tabular-nums text-foreground">{c.patientCount}</p>
                    <p className="text-[10px] text-muted-foreground/60">patients</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold tabular-nums text-foreground">{c.programCount}</p>
                    <p className="text-[10px] text-muted-foreground/60">programs</p>
                  </div>
                </div>
              </div>
            ))}
            {topClinicians.length === 0 && (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">No clinicians yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
