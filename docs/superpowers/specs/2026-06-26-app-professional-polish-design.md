# App Professional Polish — Design Spec

**Date:** 2026-06-26  
**Scope:** Full-app audit and standardization — visual consistency, functional bug fixes, global search

---

## Overview

A comprehensive pass over the entire INMOTUS RX platform to fix functional bugs, eliminate visual inconsistencies, standardize typography and color tokens, and add a global search command palette. The goal is a production-grade, cohesive feel across every page both trainers and clients see.

---

## 1. Design System Tokens (the foundation for all other changes)

All changes below use this canonical mapping. Nothing uses raw Tailwind palette colors (`slate-*`, `gray-*`) in platform or component files.

### Typography Scale

| Usage | Class |
|---|---|
| Page title (list pages) | `text-2xl font-bold tracking-tight` |
| Page title (detail/sub pages) | `text-xl font-bold` |
| Section heading inside a card | `text-base font-semibold` |
| Body / list item primary text | `text-sm font-medium` |
| Secondary / supporting text | `text-sm text-muted-foreground` |
| Caption / timestamp / label | `text-xs text-muted-foreground` |
| Tiny all-caps label | `text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50` |

### Color Token Map (replaces all hardcoded `slate-*`)

| Hardcoded | Semantic replacement |
|---|---|
| `text-slate-900` | `text-foreground` |
| `text-slate-700` | `text-foreground/80` |
| `text-slate-600` | `text-muted-foreground` |
| `text-slate-500` | `text-muted-foreground` |
| `text-slate-400` | `text-muted-foreground/60` |
| `bg-slate-900` | `bg-foreground` |
| `bg-slate-100` | `bg-muted` |
| `bg-slate-50` | `bg-muted/50` |
| `border-slate-100` | `border-border/60` |
| `border-slate-200` | `border-border` |

### Page Layout Shell

Every list/detail page uses this outer wrapper:

```tsx
<div className="space-y-6">
  {/* optional back row */}
  {/* page header row */}
  {/* content */}
</div>
```

**Page header row pattern:**
```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
    <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
  </div>
  {/* optional action button */}
</div>
```

**Back button pattern (detail/sub pages):**
```tsx
<Button variant="ghost" size="sm" asChild>
  <Link href={backHref}>
    <ArrowLeft className="mr-1 h-4 w-4" />
    {backLabel}
  </Link>
</Button>
```

---

## 2. Global Search — Command Palette

### Purpose
Make clients, programs, and exercises instantly findable from anywhere in the app without navigating menus.

### Trigger
- Header Search button (currently a visual placeholder) — clicking it opens the palette
- Keyboard shortcut: `Cmd+K` (Mac) / `Ctrl+K` (Windows/Linux)
- `"/"` key when focus is not inside a text input

### Architecture

**Server action:** `actions/search-actions.ts`
```ts
globalSearch(query: string): Promise<{
  clients: { id, firstName, lastName, email }[]   // trainer only
  programs: { id, name, status, clientId? }[]
  exercises: { id, name, bodyRegion, difficultyLevel }[]
}>
```
- Runs three parallel `prisma.findMany` calls scoped to the current user's org
- Returns max 5 results per group
- Only runs when `query.length >= 1`
- Clients group only returned for `TRAINER` role

**Component:** `components/search/command-palette.tsx`
- Uses the existing `cmdk` package (`Command`, `CommandInput`, `CommandList`, etc.)
- Wrapped in a `Dialog` for accessible overlay behavior
- Groups: "Clients", "Programs", "Exercises" — each group hidden when empty
- Each result row: icon + primary text + secondary text + keyboard hint
- Selecting any result closes palette and navigates with `router.push`
- Loading: spinner replaces search icon in input during fetch
- Empty state: "No results for «query»"

**State:** debounced input (150ms) → server action → results in local state

**Wiring:**
- A new `SearchProvider` client component wraps the layout shell in `app/(platform)/layout.tsx`. It holds `open` / `setOpen` state and exposes them via `SearchContext`.
- `CommandPalette` is mounted inside `SearchProvider` and reads `open` / `setOpen` from context.
- `Header` reads `setOpen` from `SearchContext` and passes it to the search `<Button>` as `onClick`.
- Global `"/"` keydown listener lives inside `CommandPalette` (guarded: skip if `event.target` is an input/textarea/select).

### Role-aware behavior
- Trainers see all three groups
- Clients see Programs and Exercises only (no Clients group)

---

## 3. Layout & Navigation Fixes

### 3a. Time-Aware Greeting (Trainer Dashboard)

Replace hardcoded `"Good morning 👋"` with a server-computed greeting:

```ts
function getGreeting(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}
```

Rendered as: `{getGreeting(new Date())} 👋` — computed directly inside `TrainerDashboard` (it is a server component, so `new Date()` is fine with no client JS needed). No prop change required from `dashboard/page.tsx`.

### 3b. Fix `getPageTitle()` in `components/layout/header.tsx`

Add missing routes to the exact map:

| Route | Title |
|---|---|
| `/voice-messages` | `Voice Messages` |
| `/settings/billing` | `Billing & Subscription` |
| `/settings/clinic` | `Organization Settings` |

Add missing pattern matchers:

| Pattern | Title |
|---|---|
| `/clients/[id]/adherence` | `Sessions` |
| `/clients/[id]/outcomes` | `Outcomes` |
| `/clients/[id]/progress` | `Progress` |
| `/sessions/[id]` | `Workout Session` |

Remove the broken `/settings/organization` entry (route doesn't exist).

---

## 4. Trainer Dashboard Fixes

### 4a. Pending Feedback Card Link
Change `href` from `"/dashboard"` (self-link) to `"/clients"`. The clients list is the correct next step — trainers review feedback from the client detail page.

### 4b. Remove Hardcoded Trend Strings
The current `trend` field on stat cards contains fabricated data:
- `"Active Clients": "+2 this week"` — not computed, always wrong
- `"Active Programs": "Running now"` — not meaningful

**Fix:** Replace trend strings with neutral, accurate labels:
- Active Clients → `"Manage your roster"`
- Active Programs → `"View all programs"`
- Pending Feedback → `pendingFeedback > 0 ? "Needs your attention" : "All caught up"`
- Unread Messages → `unreadMessages > 0 ? "New messages" : "Inbox clear"`

The `TrendingUp` icon next to fake data is misleading — replace with a `ChevronRight` to signal "tap to navigate" instead of implying growth.

---

## 5. Settings Page Cleanup

### Remove Redundant Profile Card
The current `/settings` page renders a manual `<Card>` showing name, email, and role — then immediately below renders Clerk's `<UserProfile>` which shows all of this and more.

**Fix:** Remove the manual profile `<Card>` entirely. Keep only the page header (`<h2>` + subtitle) and the Clerk `<UserProfile>` component.

---

## 6. Color Token Standardization

### Files to update (platform + components, not marketing page)

All `slate-*` classes in these files get replaced per the token map in Section 1:

**Pages:**
- `app/(platform)/clients/[id]/adherence/page.tsx`
- `app/(platform)/clients/[id]/outcomes/page.tsx`
- `app/(platform)/exercises/[id]/page.tsx`
- `app/(platform)/settings/clinic/page.tsx`

**Components:**
- `components/settings/organization-profile-form.tsx`
- `components/programs/program-detail-view.tsx`
- `components/workout/workout-checklist-tracker.tsx`
- `components/workout/workout-session-tracker.tsx`
- `components/programs/program-schedule-view.tsx`
- `components/programs/program-brief-upload.tsx`
- `components/exercises/bulk-import-form.tsx`
- `components/exercises/exercise-edit-form.tsx`

The marketing landing page (`app/page.tsx`) uses `slate-*` intentionally against a white/dark hero background — **leave that file alone**.

---

## 7. Page Header Standardization

Apply the canonical page header pattern (Section 1) to every list and detail page that currently deviates:

### Pages needing header fix

| Page | Current issue | Fix |
|---|---|---|
| `clients/[id]/outcomes` | `text-slate-900` hardcoded, raw `h2` | Semantic token + standard pattern |
| `clients/[id]/adherence` | Same | Same |
| `exercises/[id]` | No consistent subtitle | Add body region as subtitle |
| `settings/clinic` | `text-slate-900 / slate-600` | Semantic tokens |
| `voice-messages` | `text-xl font-bold` — inconsistent | Use `text-2xl font-bold tracking-tight` |
| `programs/[id]` | Heading inside detail view, not page-level | Ensure back button + title are consistent |

---

## 8. Files Explicitly Out of Scope

- `app/page.tsx` (marketing landing page) — uses hardcoded colors intentionally for the hero design
- All `app/admin/*` routes — separate admin panel, separate audit
- All `app/api/*` routes — no UI
- Hidden features: Check-ins, Habits, Assessments pages — left as-is

---

## Summary of New Files

| File | Purpose |
|---|---|
| `actions/search-actions.ts` | `globalSearch()` server action |
| `components/search/command-palette.tsx` | Command palette UI component |
| `components/search/search-provider.tsx` | `SearchProvider` + `SearchContext` — holds `open` state, client component |

## Summary of Modified Files

| File | Change |
|---|---|
| `app/(platform)/layout.tsx` | Wrap layout shell with `SearchProvider` client component |
| `components/layout/header.tsx` | Wire search button via `SearchContext`, fix `getPageTitle()` |
| `components/layout/sidebar.tsx` | No changes needed |
| `components/dashboard/trainer-dashboard.tsx` | Time-aware greeting, fix stat card links and trends |
| `app/(platform)/dashboard/page.tsx` | No change needed — greeting computed in `TrainerDashboard` directly |
| `app/(platform)/settings/page.tsx` | Remove redundant profile card |
| `app/(platform)/clients/[id]/adherence/page.tsx` | Color tokens + heading |
| `app/(platform)/clients/[id]/outcomes/page.tsx` | Color tokens + heading |
| `app/(platform)/exercises/[id]/page.tsx` | Color tokens |
| `app/(platform)/settings/clinic/page.tsx` | Color tokens + heading |
| `components/settings/organization-profile-form.tsx` | Color tokens |
| `components/programs/program-detail-view.tsx` | Color tokens |
| `components/workout/workout-checklist-tracker.tsx` | Color tokens |
| `components/workout/workout-session-tracker.tsx` | Color tokens |
| `components/programs/program-schedule-view.tsx` | Color tokens |
| `components/programs/program-brief-upload.tsx` | Color tokens |
| `components/exercises/bulk-import-form.tsx` | Color tokens |
| `components/exercises/exercise-edit-form.tsx` | Color tokens |
