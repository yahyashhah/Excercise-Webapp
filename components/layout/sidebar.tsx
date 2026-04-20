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
  Library,
  ClipboardCheck,
  Flame,
  TrendingUp,
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
  mobileMode?: boolean;
}

const clinicianLinks = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/patients",    label: "Clients",      icon: Users },
  { href: "/programs",    label: "Programs",     icon: Library },
  { href: "/exercises",   label: "Exercises",    icon: Dumbbell },
  { href: "/check-ins",   label: "Check-ins",    icon: ClipboardCheck },
  { href: "/habits",      label: "Habits",       icon: Flame },
  { href: "/messages",    label: "Messages",     icon: MessageSquare },
  { href: "/assessments", label: "Assessments",  icon: BarChart3 },
];

const patientLinks = [
  { href: "/dashboard",   label: "Dashboard",    icon: LayoutDashboard },
  { href: "/programs",    label: "My Programs",  icon: ClipboardList },
  { href: "/habits",      label: "Habits",       icon: Flame },
  { href: "/check-ins",   label: "Check-ins",    icon: ClipboardCheck },
  { href: "/exercises",   label: "Exercises",    icon: Dumbbell },
  { href: "/assessments", label: "Assessments",  icon: TrendingUp },
  { href: "/messages",    label: "Messages",     icon: MessageSquare },
];

export function Sidebar({
  role,
  unreadMessageCount,
  userName,
  userEmail,
  mobileMode = false,
}: SidebarProps) {
  const pathname = usePathname();
  const links = role === "CLINICIAN" ? clinicianLinks : patientLinks;

  const navItem = (href: string, label: string, Icon: React.ElementType, badge?: React.ReactNode) => {
    const isActive =
      pathname === href ||
      (href !== "/dashboard" && pathname.startsWith(href));

    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
          isActive
            ? "bg-sidebar-primary/15 text-sidebar-primary shadow-sm"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        )}
      >
        {/* Active indicator bar */}
        {isActive && (
          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
        )}
        <Icon
          className={cn(
            "h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:scale-105",
            isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50"
          )}
        />
        <span className="flex-1">{label}</span>
        {badge}
      </Link>
    );
  };

  return (
    <aside className={cn("w-64 flex-col bg-sidebar", mobileMode ? "flex" : "hidden lg:flex")}>
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border/60 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-linear-to-br from-blue-400 to-indigo-500 shadow-lg shadow-blue-500/30">
          <Activity className="h-4 w-4 text-white" />
        </div>
        <div>
          <span className="text-[15px] font-bold tracking-tight text-sidebar-foreground">
            INMOTUS RX
          </span>
          <p className="text-[10px] font-medium text-sidebar-foreground/40 uppercase tracking-widest">
            {role === "CLINICIAN" ? "Clinician Portal" : "Patient Portal"}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-5">
        <div className="mb-1 px-3 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">
            Navigation
          </p>
        </div>
        <nav className="space-y-0.5">
          {links.map((link) => {
            const badge =
              link.href === "/messages" && unreadMessageCount > 0 ? (
                <Badge
                  variant="destructive"
                  className="h-5 min-w-5 justify-center px-1 text-[10px] font-bold"
                >
                  {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                </Badge>
              ) : undefined;
            return navItem(link.href, link.label, link.icon, badge);
          })}
        </nav>

        <div className="my-5 h-px bg-sidebar-border/40" />

        <div className="mb-1 px-3 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">
            Account
          </p>
        </div>
        {navItem("/settings", "Settings", Settings)}
      </ScrollArea>

      {/* User section */}
      <div className="border-t border-sidebar-border/60 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/40 px-3 py-2.5">
          <UserButton signInUrl="/sign-in" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-foreground leading-tight">
              {userName}
            </p>
            <p className="truncate text-[11px] text-sidebar-foreground/40 leading-tight">
              {userEmail}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
