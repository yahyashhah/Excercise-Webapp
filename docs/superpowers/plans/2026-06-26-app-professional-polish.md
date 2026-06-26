# App Professional Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every page in INMOTUS RX feel production-grade through standardized typography, semantic color tokens, functional bug fixes, and a global command-palette search.

**Architecture:** Token-first — the design system table in Section 1 of the spec is the single source of truth for all color and typography decisions. Color replacements are purely mechanical (find/replace against the token map). New search feature adds one server action + two client components wired through a React context. All other changes are targeted edits to existing files.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, shadcn/ui, cmdk (already installed), Prisma, Clerk, Vitest

## Global Constraints

- Never touch `app/page.tsx` (marketing landing — uses hardcoded colors intentionally)
- Never touch `components/ui/*` (shadcn generated files)
- Never touch `app/admin/*` routes or `components/admin/*`
- Never enable hidden features: check-ins, habits, assessments pages stay commented out
- Token map is canonical — `text-slate-900` → `text-foreground`, `text-slate-600/500` → `text-muted-foreground`, `text-slate-400` → `text-muted-foreground/60`, `bg-slate-100` → `bg-muted`, `bg-slate-50` → `bg-muted/50`, `border-slate-100` → `border-border/60`, `border-slate-200` → `border-border`
- Typography: list-page titles use `text-2xl font-bold tracking-tight`, detail/sub-page titles use `text-xl font-bold`, card section headings use `text-base font-semibold`
- No new dependencies — use libraries already in `package.json`

---

## Task 1: Global Search — Server Action + Tests

**Files:**
- Create: `actions/search-actions.ts`
- Create: `actions/__tests__/search-actions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SearchResults = {
    clients: { id: string; firstName: string; lastName: string; email: string }[]
    programs: { id: string; name: string; status: string }[]
    exercises: { id: string; name: string; bodyRegion: string | null; difficultyLevel: string }[]
  }
  export async function globalSearch(query: string): Promise<SearchResults>
  ```

- [ ] **Step 1: Write the failing test**

```ts
// actions/__tests__/search-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    program: { findMany: vi.fn() },
    exercise: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/current-user', () => ({ getCurrentUser: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/current-user'
import { globalSearch } from '../search-actions'

const mockAuth = vi.mocked(auth)
const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockUserFindMany = vi.mocked(prisma.user.findMany)
const mockProgramFindMany = vi.mocked(prisma.program.findMany)
const mockExerciseFindMany = vi.mocked(prisma.exercise.findMany)

const TRAINER = { id: 'trainer_1', role: 'TRAINER', clerkOrgId: 'org_1' }
const CLIENT_USER = { id: 'client_1', role: 'CLIENT', clerkOrgId: 'org_1' }

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ orgId: 'org_1' } as any)
})

describe('globalSearch', () => {
  it('returns empty results for empty query', async () => {
    mockGetCurrentUser.mockResolvedValue(TRAINER as any)
    const result = await globalSearch('')
    expect(result).toEqual({ clients: [], programs: [], exercises: [] })
    expect(mockUserFindMany).not.toHaveBeenCalled()
  })

  it('returns clients, programs, exercises for trainer', async () => {
    mockGetCurrentUser.mockResolvedValue(TRAINER as any)
    mockUserFindMany.mockResolvedValue([{ id: 'c1', firstName: 'Jane', lastName: 'Doe', email: 'j@ex.com' }] as any)
    mockProgramFindMany.mockResolvedValue([{ id: 'p1', name: 'Rehab Plan', status: 'ACTIVE' }] as any)
    mockExerciseFindMany.mockResolvedValue([{ id: 'e1', name: 'Squat', bodyRegion: 'LOWER_BODY', difficultyLevel: 'BEGINNER' }] as any)

    const result = await globalSearch('Jane')
    expect(result.clients).toHaveLength(1)
    expect(result.clients[0].firstName).toBe('Jane')
    expect(result.programs).toHaveLength(1)
    expect(result.exercises).toHaveLength(1)
  })

  it('does not return clients for CLIENT role', async () => {
    mockGetCurrentUser.mockResolvedValue(CLIENT_USER as any)
    mockProgramFindMany.mockResolvedValue([] as any)
    mockExerciseFindMany.mockResolvedValue([] as any)

    const result = await globalSearch('test')
    expect(result.clients).toHaveLength(0)
    expect(mockUserFindMany).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx vitest run actions/__tests__/search-actions.test.ts
```

Expected: FAIL — "Cannot find module '../search-actions'"

- [ ] **Step 3: Implement the server action**

```ts
// actions/search-actions.ts
"use server"

import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { auth } from "@clerk/nextjs/server"

export type SearchResults = {
  clients: { id: string; firstName: string; lastName: string; email: string }[]
  programs: { id: string; name: string; status: string }[]
  exercises: { id: string; name: string; bodyRegion: string | null; difficultyLevel: string }[]
}

export async function globalSearch(query: string): Promise<SearchResults> {
  if (!query || query.trim().length === 0) {
    return { clients: [], programs: [], exercises: [] }
  }

  const [user, { orgId }] = await Promise.all([getCurrentUser(), auth()])
  const q = query.trim()
  const clerkOrgId = orgId ?? user.clerkOrgId ?? undefined

  const [clients, programs, exercises] = await Promise.all([
    user.role === "TRAINER" && clerkOrgId
      ? prisma.user.findMany({
          where: {
            clerkOrgId,
            role: "CLIENT",
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { id: true, firstName: true, lastName: true, email: true },
          take: 5,
        })
      : Promise.resolve([]),

    user.role === "TRAINER"
      ? prisma.program.findMany({
          where: {
            trainerId: user.id,
            name: { contains: q, mode: "insensitive" },
          },
          select: { id: true, name: true, status: true },
          take: 5,
        })
      : prisma.program.findMany({
          where: {
            clientId: user.id,
            name: { contains: q, mode: "insensitive" },
          },
          select: { id: true, name: true, status: true },
          take: 5,
        }),

    prisma.exercise.findMany({
      where: {
        name: { contains: q, mode: "insensitive" },
        OR: [
          { source: "UNIVERSAL" },
          ...(clerkOrgId ? [{ source: "ORGANIZATION" as const, organizationId: clerkOrgId }] : []),
        ],
      },
      select: { id: true, name: true, bodyRegion: true, difficultyLevel: true },
      take: 5,
    }),
  ])

  return { clients, programs, exercises }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx vitest run actions/__tests__/search-actions.test.ts
```

Expected: 4 tests PASS

---

## Task 2: Global Search — SearchProvider + CommandPalette

**Files:**
- Create: `components/search/search-provider.tsx`
- Create: `components/search/command-palette.tsx`

**Interfaces:**
- Consumes: `globalSearch` from `actions/search-actions.ts` (Task 1)
- Produces:
  ```ts
  // search-provider.tsx
  export const SearchContext: React.Context<{ open: boolean; setOpen: (v: boolean) => void }>
  export function SearchProvider({ children }: { children: React.ReactNode }): JSX.Element
  export function useSearch(): { open: boolean; setOpen: (v: boolean) => void }

  // command-palette.tsx
  export function CommandPalette({ role }: { role: "TRAINER" | "CLIENT" }): JSX.Element
  ```

- [ ] **Step 1: Create SearchProvider**

```tsx
// components/search/search-provider.tsx
"use client"

import { createContext, useContext, useState } from "react"

interface SearchContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

export const SearchContext = createContext<SearchContextValue>({
  open: false,
  setOpen: () => {},
})

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <SearchContext.Provider value={{ open, setOpen }}>
      {children}
    </SearchContext.Provider>
  )
}

export function useSearch() {
  return useContext(SearchContext)
}
```

- [ ] **Step 2: Create CommandPalette component**

```tsx
// components/search/command-palette.tsx
"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Users, Library, Dumbbell, Loader2 } from "lucide-react"
import { globalSearch, type SearchResults } from "@/actions/search-actions"
import { useSearch } from "./search-provider"

const EMPTY: SearchResults = { clients: [], programs: [], exercises: [] }

export function CommandPalette({ role }: { role: "TRAINER" | "CLIENT" }) {
  const { open, setOpen } = useSearch()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResults>(EMPTY)
  const [isPending, startTransition] = useTransition()

  // Keyboard shortcuts: Cmd+K / Ctrl+K and "/" when not in a text field
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen(true)
        return
      }
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [setOpen])

  // Debounced search
  useEffect(() => {
    if (!query) {
      setResults(EMPTY)
      return
    }
    const timeout = setTimeout(() => {
      startTransition(async () => {
        const res = await globalSearch(query)
        setResults(res)
      })
    }, 150)
    return () => clearTimeout(timeout)
  }, [query])

  function navigate(href: string) {
    setOpen(false)
    setQuery("")
    setResults(EMPTY)
    router.push(href)
  }

  const hasResults =
    results.clients.length > 0 ||
    results.programs.length > 0 ||
    results.exercises.length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) {
          setQuery("")
          setResults(EMPTY)
        }
      }}
    >
      <DialogContent className="overflow-hidden p-0 shadow-lg" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          <div className="flex items-center border-b px-3">
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <span className="mr-2 text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </span>
            )}
            <CommandInput
              placeholder="Search clients, programs, exercises…"
              value={query}
              onValueChange={setQuery}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-0 focus:ring-0"
            />
          </div>
          <CommandList>
            {query && !hasResults && !isPending && (
              <CommandEmpty>No results for &ldquo;{query}&rdquo;</CommandEmpty>
            )}

            {role === "TRAINER" && results.clients.length > 0 && (
              <CommandGroup heading="Clients">
                {results.clients.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`client-${c.id}`}
                    onSelect={() => navigate(`/clients/${c.id}`)}
                    className="flex items-center gap-3"
                  >
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{c.firstName} {c.lastName}</span>
                      <span className="text-xs text-muted-foreground">{c.email}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.programs.length > 0 && (
              <>
                {role === "TRAINER" && results.clients.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Programs">
                  {results.programs.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`program-${p.id}`}
                      onSelect={() => navigate(`/programs/${p.id}`)}
                      className="flex items-center gap-3"
                    >
                      <Library className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{p.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {results.exercises.length > 0 && (
              <>
                {results.programs.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Exercises">
                  {results.exercises.map((e) => (
                    <CommandItem
                      key={e.id}
                      value={`exercise-${e.id}`}
                      onSelect={() => navigate(`/exercises/${e.id}`)}
                      className="flex items-center gap-3"
                    >
                      <Dumbbell className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{e.name}</span>
                        {e.bodyRegion && (
                          <span className="text-xs text-muted-foreground capitalize">
                            {e.bodyRegion.replace(/_/g, " ").toLowerCase()}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | grep -E "search-provider|command-palette" | head -20
```

Expected: no errors for the two new files

---

## Task 3: Wire Search into Layout + Fix Header

**Files:**
- Modify: `app/(platform)/layout.tsx`
- Modify: `components/layout/header.tsx`

**Interfaces:**
- Consumes: `SearchProvider`, `CommandPalette` (Task 2), `useSearch` (Task 2)

- [ ] **Step 1: Update layout.tsx to wrap with SearchProvider and mount CommandPalette**

Open `app/(platform)/layout.tsx`. Replace the `return` block:

```tsx
// app/(platform)/layout.tsx
// Add these imports at the top:
import { SearchProvider } from "@/components/search/search-provider"
import { CommandPalette } from "@/components/search/command-palette"

// Replace the return statement:
  return (
    <SearchProvider>
      <div className="flex h-screen overflow-hidden bg-[oklch(0.97_0.005_247)]">
        <Sidebar
          role={user.role}
          currentPath=""
          unreadMessageCount={unreadMessageCount}
          userName={`${user.firstName} ${user.lastName}`}
          userEmail={user.email}
          userImageUrl={user.imageUrl}
          isAdmin={adminAccess}
          unreadVoiceCount={unreadVoiceCount}
          trainerClerkId={trainerClerkId}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header
            user={user}
            unreadMessageCount={unreadMessageCount}
            unreadNotificationCount={unreadNotificationCount}
            initialNotifications={initialNotifications}
            unreadVoiceCount={unreadVoiceCount}
            trainerClerkId={trainerClerkId}
          />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="page-enter">{children}</div>
          </main>
        </div>
        <CommandPalette role={user.role} />
      </div>
    </SearchProvider>
  )
```

- [ ] **Step 2: Update header.tsx — wire search button + fix getPageTitle**

Open `components/layout/header.tsx`. Make these exact changes:

**2a. Add import for `useSearch`:**
```tsx
import { useSearch } from "@/components/search/search-provider"
```

**2b. Inside the `Header` function body, add:**
```tsx
  const { setOpen: openSearch } = useSearch()
```

**2c. Replace the search `<Button>` (the one with "Search..." placeholder text):**
```tsx
      <Button
        variant="outline"
        size="sm"
        className="hidden gap-2 text-muted-foreground sm:flex"
        onClick={() => openSearch(true)}
      >
        <Search className="h-3.5 w-3.5" />
        <span className="text-xs">Search...</span>
        <kbd className="pointer-events-none ml-2 hidden rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </Button>
```

**2d. Replace the entire `getPageTitle` function:**
```tsx
function getPageTitle(pathname: string): string {
  const exactMap: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/exercises": "Exercise Library",
    "/exercises/new": "New Exercise",
    "/programs": "Programs",
    "/programs/new": "New Program",
    "/programs/generate": "Generate Program",
    "/programs/upload": "Upload Program",
    "/clients": "Clients",
    "/messages": "Messages",
    "/voice-messages": "Voice Messages",
    "/assessments": "Assessments",
    "/assessments/new": "New Assessment",
    "/check-ins": "Check-ins",
    "/check-ins/new": "New Check-in Template",
    "/habits": "Habits",
    "/settings": "Settings",
    "/settings/billing": "Billing & Subscription",
    "/settings/clinic": "Organization Settings",
  }

  if (exactMap[pathname]) return exactMap[pathname]

  if (pathname.startsWith("/exercises/") && pathname.endsWith("/edit")) return "Edit Exercise"
  if (pathname.startsWith("/exercises/")) return "Exercise Details"
  if (pathname.startsWith("/programs/") && pathname.endsWith("/edit")) return "Edit Program"
  if (pathname.startsWith("/programs/")) return "Program Details"
  if (pathname.startsWith("/clients/") && pathname.endsWith("/adherence")) return "Sessions"
  if (pathname.startsWith("/clients/") && pathname.endsWith("/outcomes")) return "Outcomes"
  if (pathname.startsWith("/clients/") && pathname.endsWith("/progress")) return "Progress"
  if (pathname.startsWith("/clients/")) return "Client Details"
  if (pathname.startsWith("/messages/")) return "Conversation"
  if (pathname.startsWith("/sessions/")) return "Workout Session"
  if (pathname.startsWith("/check-ins/") && pathname.endsWith("/respond")) return "Complete Check-in"
  if (pathname.startsWith("/check-ins/")) return "Check-in Response"

  return "INMOTUS RX"
}
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | grep -E "layout|header|search" | head -20
```

Expected: no type errors

---

## Task 4: Trainer Dashboard Fixes

**Files:**
- Modify: `components/dashboard/trainer-dashboard.tsx`

- [ ] **Step 1: Add time-aware greeting helper and fix stat cards**

Open `components/dashboard/trainer-dashboard.tsx`. Make these exact changes:

**1a. Add greeting helper above `statCards`:**
```ts
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}
```

**1b. Replace the hardcoded `statCards` function — change the `trend` and `href` fields:**
```ts
const statCards = (
  clientCount: number,
  activePrograms: number,
  pendingFeedback: number,
  unreadMessages: number,
) => [
  {
    label: "Active Clients",
    value: clientCount,
    icon: Users,
    href: "/clients",
    gradient: "from-blue-500 to-indigo-600",
    bg: "bg-blue-50",
    iconColor: "text-blue-600",
    trend: "Manage your roster",
  },
  {
    label: "Active Programs",
    value: activePrograms,
    icon: Library,
    href: "/programs",
    gradient: "from-emerald-500 to-teal-600",
    bg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    trend: "View all programs",
  },
  {
    label: "Pending Feedback",
    value: pendingFeedback,
    icon: AlertCircle,
    href: "/clients",
    gradient: "from-amber-500 to-orange-600",
    bg: "bg-amber-50",
    iconColor: "text-amber-600",
    trend: pendingFeedback > 0 ? "Needs your attention" : "All caught up",
  },
  {
    label: "Unread Messages",
    value: unreadMessages,
    icon: MessageSquare,
    href: "/messages",
    gradient: "from-violet-500 to-purple-600",
    bg: "bg-violet-50",
    iconColor: "text-violet-600",
    trend: unreadMessages > 0 ? "New messages" : "Inbox clear",
  },
]
```

**1c. Replace the hardcoded greeting in the JSX. Find:**
```tsx
          <h1 className="text-2xl font-bold tracking-tight">Good morning 👋</h1>
```
Replace with:
```tsx
          <h1 className="text-2xl font-bold tracking-tight">{getGreeting()} 👋</h1>
```

**1d. In each stat card's trend row, replace `TrendingUp` icon with `ChevronRight`. Find the import line:**
```tsx
  CalendarDays,
  TrendingUp,
  ArrowUpRight,
```
Replace with:
```tsx
  CalendarDays,
  ChevronRight,
  ArrowUpRight,
```

Then find inside the card JSX:
```tsx
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground/70">
                      <TrendingUp className="h-3 w-3" />
                      {card.trend}
                    </p>
```
Replace with:
```tsx
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground/70">
                      <ChevronRight className="h-3 w-3" />
                      {card.trend}
                    </p>
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | grep "trainer-dashboard" | head -10
```

Expected: no errors

---

## Task 5: Settings Page Cleanup

**Files:**
- Modify: `app/(platform)/settings/page.tsx`

- [ ] **Step 1: Remove redundant profile card and fix heading**

Replace the entire file content:

```tsx
// app/(platform)/settings/page.tsx
import { UserProfile } from "@clerk/nextjs"

export default async function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account and profile</p>
      </div>

      <div className="overflow-hidden rounded-lg">
        <UserProfile
          appearance={{
            elements: {
              rootBox: "w-full",
              cardBox: "shadow-none border border-border rounded-lg",
            },
          }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | grep "settings/page" | head -5
```

Expected: no errors

---

## Task 6: Color Tokens + Headers — Platform Pages

**Files:**
- Modify: `app/(platform)/clients/[id]/adherence/page.tsx`
- Modify: `app/(platform)/clients/[id]/outcomes/page.tsx`
- Modify: `app/(platform)/exercises/[id]/page.tsx`
- Modify: `app/(platform)/settings/clinic/page.tsx`
- Modify: `app/(platform)/clients/[id]/sessions/[sessionId]/page.tsx`
- Modify: `app/(platform)/settings/billing/page.tsx`
- Modify: `app/(platform)/clients/page.tsx`

Apply the canonical token map to every `slate-*` occurrence in each file. Additionally fix page heading classes where noted.

**Adherence page** (`app/(platform)/clients/[id]/adherence/page.tsx`):
- Line 21: `"bg-slate-100 text-slate-600"` → `"bg-muted text-muted-foreground"` (SKIPPED status color)
- Line 41: `className="text-xl font-bold"` — keep as-is (sub-page, `text-xl font-bold` is correct per spec)

**Outcomes page** (`app/(platform)/clients/[id]/outcomes/page.tsx`):
- Line 41: `className="text-xl font-bold text-slate-900"` → `className="text-xl font-bold"`
- Line 49: `className="text-slate-500"` → `className="text-muted-foreground"`
- Line 61: `className="... border border-slate-100 ..."` → `className="... border border-border/60 ..."`
- Line 63: `className="text-sm font-medium text-slate-900"` → `className="text-sm font-medium"`
- Line 66: `className="text-xs text-slate-500"` → `className="text-xs text-muted-foreground"`
- Line 68: `className="text-xs text-slate-400"` → `className="text-xs text-muted-foreground/60"`

**Exercise detail page** (`app/(platform)/exercises/[id]/page.tsx`) — replace all slate-* per token map:
- `text-slate-500` → `text-muted-foreground` (lines 68, 84)
- `bg-slate-100` → `bg-muted` (lines 89)
- `text-slate-900` → `text-foreground` (lines 103, 111, 122, 146, 157, 168, 180)
- `text-slate-600` → `text-muted-foreground` (lines 104, 123, 147, 169)
- `border-slate-200` → `border-border` (line 186)
- `hover:bg-slate-50` → `hover:bg-muted/50` (line 186)

**Clinic settings page** (`app/(platform)/settings/clinic/page.tsx`):
- Line 21: `className="text-2xl font-bold text-slate-900"` → `className="text-2xl font-bold tracking-tight"`
- Line 22: `className="text-slate-600"` → `className="mt-1 text-sm text-muted-foreground"`

**Sessions sub-page** (`app/(platform)/clients/[id]/sessions/[sessionId]/page.tsx`):
- Replace all `slate-*` per token map

**Billing page** (`app/(platform)/settings/billing/page.tsx`):
- Replace all `slate-*` per token map

**Clients list page** (`app/(platform)/clients/page.tsx`):
- Replace all `slate-*` per token map (2 occurrences)

- [ ] **Step 1: Apply all replacements above to each file**

For each file, read it, apply the replacements exactly as listed, and save. Use the token map from Global Constraints as the reference.

- [ ] **Step 2: Verify no slate-* remains in these files**

```bash
grep -rn "slate-" \
  /Users/yahyashah/Dev/Excercise-Webapp/app/\(platform\)/clients/\[id\]/adherence/page.tsx \
  /Users/yahyashah/Dev/Excercise-Webapp/app/\(platform\)/clients/\[id\]/outcomes/page.tsx \
  /Users/yahyashah/Dev/Excercise-Webapp/app/\(platform\)/exercises/\[id\]/page.tsx \
  /Users/yahyashah/Dev/Excercise-Webapp/app/\(platform\)/settings/clinic/page.tsx \
  /Users/yahyashah/Dev/Excercise-Webapp/app/\(platform\)/settings/billing/page.tsx \
  /Users/yahyashah/Dev/Excercise-Webapp/app/\(platform\)/clients/page.tsx
```

Expected: no output

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors

---

## Task 7: Color Tokens — Active Components

**Files:**
- Modify: `components/exercises/exercise-edit-form.tsx`
- Modify: `components/exercises/exercise-card.tsx`
- Modify: `components/exercises/exercise-form.tsx`
- Modify: `components/exercises/exercise-filters.tsx`
- Modify: `components/exercises/exercise-image.tsx`
- Modify: `components/exercises/exercise-image-lightbox.tsx`
- Modify: `components/messages/message-thread.tsx`
- Modify: `components/messages/messages-inbox-client.tsx`
- Modify: `components/programs/program-list-client.tsx`
- Modify: `components/programs/exercise-picker-dialog.tsx`
- Modify: `components/workout/plan-status-badge.tsx`
- Modify: `components/workout/workout-mode-wrapper.tsx`
- Modify: `components/workout/plan-feedback-section.tsx`
- Modify: `components/workout/plan-status-actions.tsx`
- Modify: `components/workout/plan-card.tsx`
- Modify: `components/workout/workout-flow.tsx`
- Modify: `components/billing/pricing-cards.tsx`
- Modify: `components/dashboard/client-dashboard.tsx`
- Modify: `components/dashboard/trainer-dashboard.tsx`
- Modify: `components/clients/client-search.tsx`
- Modify: `components/settings/organization-profile-form.tsx`
- Modify: `components/progress/soap-notes-tab.tsx`
- Modify: `components/progress/clinical-note-form.tsx`

Apply the canonical token map (Global Constraints) to every `slate-*` occurrence in each file. The replacements are mechanical — each instance maps to a single token per the table. Notable specific fixes:

**`exercise-edit-form.tsx`** (12 occurrences):
- `border-slate-200` → `border-border`
- `text-slate-900` → `text-foreground`
- `text-slate-500` → `text-muted-foreground`
- `bg-slate-100` → `bg-muted`
- `text-slate-600` → `text-muted-foreground`
- `bg-slate-800` → `bg-foreground` (the dark video placeholder background — keep as-is, it's intentional contrast)

**`exercise-card.tsx`** (4 occurrences):
- `text-slate-800` → `text-foreground`
- `bg-slate-700/80` → `bg-foreground/70`
- `text-slate-600 border-slate-200 hover:bg-slate-50` → `text-muted-foreground border-border hover:bg-muted/50`

**`plan-status-badge.tsx`** (2 occurrences — DRAFT and ARCHIVED status colors):
- `"bg-slate-100 text-slate-700"` → `"bg-muted text-muted-foreground"`
- `"bg-slate-100 text-slate-500"` → `"bg-muted text-muted-foreground/70"`

**`trainer-dashboard.tsx`** (2 occurrences in the sessions section):
- Replace per token map

**`client-dashboard.tsx`** (1 occurrence):
- Replace per token map

- [ ] **Step 1: Apply all token replacements to every file listed above**

For each file: read it, replace every `slate-*` occurrence using the token map, save. Do NOT change intentional dark backgrounds used for video/media contrast areas — the `bg-slate-800` used as a video container dark background in `exercise-edit-form.tsx` line 335 should become `bg-muted-foreground/10` (a neutral dark-ish muted tone) rather than the literal mapping to `bg-foreground`.

- [ ] **Step 2: Verify no slate-* remains in any in-scope component**

```bash
grep -rn "slate-" \
  /Users/yahyashah/Dev/Excercise-Webapp/components/exercises/ \
  /Users/yahyashah/Dev/Excercise-Webapp/components/messages/ \
  /Users/yahyashah/Dev/Excercise-Webapp/components/programs/ \
  /Users/yahyashah/Dev/Excercise-Webapp/components/workout/ \
  /Users/yahyashah/Dev/Excercise-Webapp/components/billing/ \
  /Users/yahyashah/Dev/Excercise-Webapp/components/dashboard/ \
  /Users/yahyashah/Dev/Excercise-Webapp/components/clients/ \
  /Users/yahyashah/Dev/Excercise-Webapp/components/settings/ \
  /Users/yahyashah/Dev/Excercise-Webapp/components/progress/ \
  2>/dev/null | grep -v "components/ui/"
```

Expected: no output

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors

---

## Task 8: Voice Messages Page Header + Final Standardization

**Files:**
- Modify: `app/(platform)/voice-messages/page.tsx`

- [ ] **Step 1: Standardize the voice messages page header**

Open `app/(platform)/voice-messages/page.tsx`. Replace the header section:

Find:
```tsx
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
          <Mic className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Voice Messages</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
      </div>
```

Replace with:
```tsx
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Voice Messages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
      </div>
```

- [ ] **Step 2: Final verification — count total remaining slate-* in platform + components**

```bash
grep -rn "slate-" \
  /Users/yahyashah/Dev/Excercise-Webapp/app/\(platform\) \
  /Users/yahyashah/Dev/Excercise-Webapp/components \
  --include="*.tsx" \
  2>/dev/null \
  | grep -v "components/ui/" \
  | grep -v "admin" \
  | grep -v "check-ins" \
  | grep -v "habits" \
  | grep -v "assessments" \
  | grep -v "onboarding"
```

Expected: no output (or only intentional uses you've consciously kept)

- [ ] **Step 3: Full TypeScript check**

```bash
cd /Users/yahyashah/Dev/Excercise-Webapp && npx tsc --noEmit 2>&1
```

Expected: 0 errors (or only pre-existing errors unrelated to this work)

---

## Self-Review Checklist

**Spec coverage:**
- [x] Global search (Task 1, 2, 3) — server action + provider + palette + wired
- [x] `getPageTitle` fix (Task 3) — all missing routes added
- [x] Time-aware greeting (Task 4)
- [x] Stat card trend fix + Pending Feedback link fix (Task 4)
- [x] Settings redundant card removed (Task 5)
- [x] Color tokens — pages (Task 6)
- [x] Color tokens — components (Task 7)
- [x] Voice messages heading (Task 8)
- [x] Hardcoded `/` keybind shortcut (Task 3 — `"/"` listener in CommandPalette)

**Type consistency:**
- `SearchResults` type defined in Task 1, consumed in Task 2 via import ✓
- `useSearch()` defined in Task 2, consumed in Task 3 (header) ✓
- `SearchProvider` wraps layout, `CommandPalette` and `Header` are children ✓
- `role` prop on `CommandPalette` comes from `user.role` in layout ✓

**Placeholder scan:** No TBDs, TODOs, or "similar to" references. All code blocks show full implementations. ✓
