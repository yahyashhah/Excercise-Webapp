"use client";

import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Bell, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import type { User } from "@prisma/client";

interface HeaderProps {
  user: User;
  unreadMessageCount: number;
}

function getPageTitle(pathname: string): string {
  const exactMap: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/exercises": "Exercise Library",
    "/exercises/new": "New Exercise",
    "/programs": "Programs",
    "/programs/new": "New Program",
    "/programs/generate": "Generate Program",
    "/patients": "Clients",
    "/messages": "Messages",
    "/assessments": "Assessments",
    "/assessments/new": "New Assessment",
    "/settings": "Settings",
    "/settings/clinic": "Clinic Settings",
  };

  if (exactMap[pathname]) return exactMap[pathname];

  if (pathname.startsWith("/exercises/") && pathname.endsWith("/edit")) return "Edit Exercise";
  if (pathname.startsWith("/exercises/")) return "Exercise Details";
  if (pathname.startsWith("/programs/") && pathname.endsWith("/edit")) return "Edit Program";
  if (pathname.startsWith("/programs/")) return "Program Details";
  if (pathname.startsWith("/patients/") && pathname.endsWith("/adherence")) return "Adherence";
  if (pathname.startsWith("/patients/") && pathname.endsWith("/outcomes")) return "Outcomes";
  if (pathname.startsWith("/patients/")) return "Client Details";
  if (pathname.startsWith("/messages/")) return "Conversation";
  if (pathname.startsWith("/sessions/")) return "Workout Session";

  return "INMOTUS RX";
}

export function Header({ user, unreadMessageCount }: HeaderProps) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="flex h-16 items-center gap-4 border-b border-border bg-card px-6">
      {/* Mobile menu */}
      <Sheet>
        <SheetTrigger
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-sm font-medium transition-all outline-none select-none hover:bg-muted hover:text-foreground size-8 lg:hidden"
        >
          <Menu className="h-5 w-5" />
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
            mobileMode
          />
        </SheetContent>
      </Sheet>

      {/* Breadcrumb-style page title */}
      <div className="flex items-center gap-2">
        <span className="hidden text-sm font-semibold text-primary sm:inline-block">
          INMOTUS RX
        </span>
        <span className="hidden text-muted-foreground/40 sm:inline-block">/</span>
        <h1 className="text-sm font-semibold sm:text-base">{pageTitle}</h1>
      </div>

      <div className="flex-1" />

      {/* Search placeholder */}
      <Button variant="outline" size="sm" className="hidden gap-2 text-muted-foreground sm:flex">
        <Search className="h-3.5 w-3.5" />
        <span className="text-xs">Search...</span>
        <kbd className="pointer-events-none ml-2 hidden rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
          /
        </kbd>
      </Button>

      {/* Notifications */}
      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-4.5 w-4.5 text-muted-foreground" />
        {unreadMessageCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {unreadMessageCount}
          </span>
        )}
      </Button>

      {/* User button (visible on desktop alongside sidebar) */}
      <div className="hidden lg:block">
        <UserButton signInUrl="/sign-in" />
      </div>
    </header>
  );
}
