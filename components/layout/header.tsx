"use client";

import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Bell, Menu, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import type { User } from "@prisma/client";

interface HeaderProps {
  user: User;
  unreadMessageCount: number;
}

function getPageTitle(pathname: string): string {
  const map: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/exercises": "Exercise Library",
    "/exercises/new": "New Exercise",
    "/workout-plans": "Workout Plans",
    "/workout-plans/generate": "Generate Plan",
    "/patients": "Clients",
    "/messages": "Messages",
    "/assessments": "Assessments",
    "/assessments/new": "New Assessment",
    "/settings": "Settings",
  };

  for (const [path, title] of Object.entries(map)) {
    if (pathname === path) return title;
  }

  if (pathname.startsWith("/exercises/")) return "Exercise Details";
  if (pathname.startsWith("/workout-plans/") && pathname.endsWith("/edit")) return "Edit Plan";
  if (pathname.startsWith("/workout-plans/") && pathname.endsWith("/session")) return "Workout Session";
  if (pathname.startsWith("/workout-plans/")) return "Plan Details";
  if (pathname.startsWith("/patients/") && pathname.endsWith("/adherence")) return "Adherence";
  if (pathname.startsWith("/patients/") && pathname.endsWith("/outcomes")) return "Outcomes";
  if (pathname.startsWith("/patients/")) return "Client Details";
  if (pathname.startsWith("/messages/")) return "Conversation";

  return "INMOTUS RX";
}

export function Header({ user, unreadMessageCount }: HeaderProps) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-card/80 backdrop-blur-sm px-5 sticky top-0 z-10">
      {/* Mobile menu */}
      <Sheet>
        <SheetTrigger
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-all outline-none select-none hover:bg-muted hover:text-foreground size-8 lg:hidden"
        >
          <Menu className="h-4.5 w-4.5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            role={user.role}
            currentPath={pathname}
            unreadMessageCount={unreadMessageCount}
            userName={`${user.firstName} ${user.lastName}`}
            userEmail={user.email}
            userImageUrl={user.imageUrl}
          />
        </SheetContent>
      </Sheet>

      {/* Brand + breadcrumb */}
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="hidden items-center gap-1.5 lg:flex">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-linear-to-br from-blue-400 to-indigo-500">
            <Activity className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-xs font-semibold text-muted-foreground/60">INMOTUS RX</span>
          <span className="text-muted-foreground/30">/</span>
        </div>
        <h1 className="text-sm font-semibold text-foreground truncate">{pageTitle}</h1>
      </div>

      <div className="flex-1" />

      {/* Notifications */}
      <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground hover:text-foreground" asChild>
        <a href="/messages">
          <Bell className="h-4 w-4" />
          {unreadMessageCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold text-white shadow">
              {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
            </span>
          )}
        </a>
      </Button>

      {/* User button — desktop only */}
      <div className="hidden lg:block">
        <UserButton signInUrl="/sign-in" />
      </div>
    </header>
  );
}
