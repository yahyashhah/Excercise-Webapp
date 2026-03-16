"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Dumbbell,
  ClipboardList,
  Users,
  // MessageSquare,  // coming soon
  // BarChart3,      // coming soon
  Settings,
  Sparkles,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SidebarProps {
  role: "CLINICIAN" | "PATIENT";
  currentPath: string;
  unreadMessageCount: number;
  userName: string;
  userEmail: string;
  userImageUrl?: string | null;
}

const clinicianLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/exercises", label: "Exercises", icon: Dumbbell },
  { href: "/workout-plans", label: "Workout Plans", icon: ClipboardList },
  { href: "/workout-plans/generate", label: "Generate Plan", icon: Sparkles },
  { href: "/patients", label: "Patients", icon: Users },
  // { href: "/messages", label: "Messages", icon: MessageSquare },      // coming soon
  // { href: "/assessments", label: "Assessments", icon: BarChart3 },    // coming soon
];

const patientLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/exercises", label: "Exercises", icon: Dumbbell },
  { href: "/workout-plans", label: "My Plans", icon: ClipboardList },
  // { href: "/messages", label: "Messages", icon: MessageSquare },      // coming soon
  // { href: "/assessments", label: "Assessments", icon: BarChart3 },    // coming soon
];

export function Sidebar({
  role,
  unreadMessageCount,
  userName,
  userEmail,
}: SidebarProps) {
  const pathname = usePathname();
  const links = role === "CLINICIAN" ? clinicianLinks : patientLinks;

  return (
    <aside className="hidden w-64 flex-col bg-sidebar lg:flex">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500">
          <Activity className="h-4.5 w-4.5 text-white" />
        </div>
        <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
          RehabAI
        </span>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {links.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href !== "/dashboard" && pathname.startsWith(link.href));
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary/20 text-sidebar-primary font-semibold border-r-2 border-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                <span className="flex-1">{link.label}</span>
                {link.href === "/messages" && unreadMessageCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="h-5 min-w-[1.25rem] justify-center px-1 text-xs"
                  >
                    {unreadMessageCount}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="my-4 h-px bg-sidebar-border" />

        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === "/settings"
              ? "bg-sidebar-primary/20 text-sidebar-primary font-semibold border-r-2 border-sidebar-primary"
              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}
        >
          <Settings className="h-[18px] w-[18px] flex-shrink-0" />
          <span>Settings</span>
        </Link>
      </ScrollArea>

      {/* User section */}
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <UserButton signInUrl="/sign-in" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {userName}
            </p>
            <div className="flex items-center gap-2">
              <p className="truncate text-xs text-sidebar-foreground/50">
                {userEmail}
              </p>
            </div>
          </div>
          <Badge
            variant="secondary"
            className="shrink-0 bg-sidebar-accent text-sidebar-accent-foreground text-[10px] px-1.5 py-0.5"
          >
            {role}
          </Badge>
        </div>
      </div>
    </aside>
  );
}
