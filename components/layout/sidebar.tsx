"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Dumbbell,
  ClipboardList,
  Users,
  MessageSquare,
  BarChart3,
  Settings,
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
  { href: "/patients", label: "Clients", icon: Users },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/assessments", label: "Assessments", icon: BarChart3 },
];

const patientLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/exercises", label: "Exercises", icon: Dumbbell },
  { href: "/workout-plans", label: "My Plans", icon: ClipboardList },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/assessments", label: "Assessments", icon: BarChart3 },
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
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-blue-400 to-indigo-500 shadow-sm shadow-blue-500/30">
          <Activity className="h-5 w-5 text-white" />
        </div>
        <div>
          <span className="text-base font-bold tracking-tight text-sidebar-foreground">
            INMOTUS RX
          </span>
          <p className="text-[10px] text-sidebar-foreground/40 -mt-0.5 font-medium uppercase tracking-widest">
            {role === "CLINICIAN" ? "Clinician Portal" : "Patient Portal"}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">
          Navigation
        </p>
        <nav className="space-y-0.5">
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
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-sidebar-primary/15 text-sidebar-primary"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <Icon className={cn("h-4.5 w-4.5 shrink-0 transition-colors", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/40")} />
                <span className="flex-1">{link.label}</span>
                {link.href === "/messages" && unreadMessageCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[10px] font-bold text-white">
                    {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="my-4 h-px bg-sidebar-border/60" />

        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">
          Account
        </p>
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
            pathname === "/settings"
              ? "bg-sidebar-primary/15 text-sidebar-primary"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}
        >
          <Settings className={cn("h-4.5 w-4.5 shrink-0 transition-colors", pathname === "/settings" ? "text-sidebar-primary" : "text-sidebar-foreground/40")} />
          <span>Settings</span>
        </Link>
      </ScrollArea>

      {/* User section */}
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 rounded-lg p-2">
          <UserButton signInUrl="/sign-in" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-foreground leading-tight">
              {userName}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/40 mt-0.5">
              {userEmail}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
