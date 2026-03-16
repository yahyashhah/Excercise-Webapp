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
import { Badge } from "@/components/ui/badge";
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
  { label: "Patients", href: ROUTES.PATIENTS, icon: Users, roles: ["clinician"] },
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
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            ExerciseAI
          </SheetTitle>
        </SheetHeader>
        <nav className="p-4 space-y-1">
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
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.href === ROUTES.MESSAGES && unreadCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="ml-auto h-5 min-w-[20px] px-1 text-xs"
                  >
                    {unreadCount}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
