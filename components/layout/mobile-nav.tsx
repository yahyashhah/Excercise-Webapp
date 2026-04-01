"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ROUTES } from "@/lib/utils/constants";

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unreadCount: number;
}

const navItems = [
  { label: "Dashboard", href: ROUTES.DASHBOARD, icon: LayoutDashboard, roles: ["clinician", "patient"] },
  { label: "Exercises", href: ROUTES.EXERCISES, icon: Dumbbell, roles: ["clinician", "patient"] },
  { label: "Workout Plans", href: ROUTES.WORKOUT_PLANS, icon: ClipboardList, roles: ["clinician", "patient"] },
  { label: "Clients", href: ROUTES.PATIENTS, icon: Users, roles: ["clinician"] },
  { label: "Messages", href: ROUTES.MESSAGES, icon: MessageSquare, roles: ["clinician", "patient"] },
  { label: "Assessments", href: ROUTES.ASSESSMENTS, icon: BarChart3, roles: ["clinician", "patient"] },
  { label: "Settings", href: ROUTES.SETTINGS, icon: Settings, roles: ["clinician", "patient"] },
];

export function MobileNav({ open, onOpenChange, unreadCount }: MobileNavProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const userRole = (user?.publicMetadata?.role as string) ?? "";

  const filteredNav = navItems.filter(
    (item) => !userRole || item.roles.includes(userRole)
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-64 p-0 bg-sidebar">
        <SheetHeader className="flex h-16 flex-row items-center gap-3 border-b border-sidebar-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-blue-400 to-indigo-500 shadow-sm">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <SheetTitle className="text-base font-bold text-sidebar-foreground">INMOTUS RX</SheetTitle>
        </SheetHeader>
        <nav className="p-3 space-y-0.5">
          {filteredNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== ROUTES.DASHBOARD && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onOpenChange(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-sidebar-primary/15 text-sidebar-primary"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <item.icon className={cn("h-4.5 w-4.5 shrink-0", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/40")} />
                <span className="flex-1">{item.label}</span>
                {item.href === ROUTES.MESSAGES && unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
