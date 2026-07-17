# App-Wide Design Standardization — Design

## Problem

The app's design tokens are actually solid (real OKLCH palette, custom heading font, thoughtful calendar theming) — this is not a "generic AI-generated defaults" problem at the token level. The problem is **inconsistent application**, confirmed concretely:

- Two different `StatCard` components exist (`components/dashboard/stat-card.tsx`, `components/admin/stat-card.tsx`) with different visual treatments — and neither is actually used by the trainer dashboard, which builds its stat cards inline a third way.
- A `PageHeader` component (`components/shared/page-header.tsx`) and an `EmptyState` component (`components/shared/empty-state.tsx`) already exist, well-built — but **zero pages import either one**. Every page reinvented its own header markup (`<h1 className="text-3xl...">` vs `<h2 className="text-2xl...">`) and its own empty-state markup independently.
- `Messages` (`/messages`) renders full-width (`space-y-6`, no max-width); `Voice Messages` (`/voice-messages`) renders in a narrow centered column (`mx-auto max-w-2xl`). Switching between the two tabs jumps the entire page width.
- `Analytics` (`/analytics`) uses raw `<div className="rounded-2xl border border-border bg-card p-5">` for its stat cards instead of the shared `Card` component used everywhere else.
- Page titles are a three-way split: `Programs` uses `<h1 className="text-3xl">`, `Dashboard`/`Analytics` use `<h1 className="text-2xl">`, `Clients`/`Exercises`/`Messages`/`Assessments` use `<h2 className="text-2xl">`.
- `Exercises`' filter bar has grown to 6 body-region pills + 5 category pills + 22 muscle-group pills, all always visible — 3-4 rows of pills before any exercise is visible.

## Scope

Every page under `app/(platform)/**` (~30 pages, listed in the per-page table below). Explicitly **out of scope**: `/admin/**` (a separate super-admin portal with its own audience — not what "the app" means to the trainer using it day to day), and the `Check-ins`/`Habits` pages (deliberately hidden from nav per a prior design decision — not reachable, so not part of "the pages we see").

## 1. Foundation — tokens and conventions (apply everywhere)

- **Headings**: swap `Plus Jakarta Sans` → **Lexend** in `app/layout.tsx` (`next/font/google`) and its CSS variable in `app/globals.css`. Body text stays Inter. Only 2 real source files reference the old variable name, confirmed via grep — low-risk swap.
- **Type scale, locked, no exceptions**:
  - Page title: `text-3xl font-bold tracking-tight` (promoting the mixed 2xl/3xl pages to one standard)
  - Section/card title: `text-base font-semibold`
  - Body: `text-sm`
  - Caption/meta: `text-xs text-muted-foreground`
  - Stat value: `text-3xl font-bold tabular-nums`
- **Spacing**: card padding `p-6` (up from the mixed `p-4`/`p-5`), page section gaps `space-y-8`, grid gaps `gap-6`.
- **New `--color-success` token** in `app/globals.css`, a teal/sage derived from the existing `--chart-1` hue (`oklch(0.55 0.18 200)`), formalizing what's currently scattered as hardcoded `emerald-500`/`green-400` Tailwind classes for positive states (completion rate, streaks, "felt good" feedback, "all caught up" empty states).
- **Elevation, 3 levels, no others**:
  1. Flat — border only, no shadow (list rows, secondary content)
  2. Resting card — `shadow-sm` + `ring-1 ring-border/50` (primary cards)
  3. Hover-lift — `hover:-translate-y-0.5 hover:shadow-md hover:ring-border` (clickable cards only)
- **Every boxed content area uses the shared `Card`/`CardHeader`/`CardTitle`/`CardContent` components.** No raw styled `<div>`s standing in for cards.

## 2. Shared primitives to consolidate/build

- **`components/shared/page-header.tsx`** (exists, needs a small update): bump its `h1` from `text-2xl` to `text-3xl` per the new scale. Every page adopts this component for its title/description/action-button row instead of hand-rolling one.
- **`components/shared/empty-state.tsx`** (exists, no changes needed): every empty state in the app (no clients, no messages, no exercises found, no programs, etc.) adopts this component instead of a bespoke one.
- **One shared `StatCard`**: consolidate the three existing implementations into a single `components/shared/stat-card.tsx`, based on `admin/stat-card.tsx`'s treatment (icon-in-a-chip, `text-3xl` bold value, optional trend badge) since it's the closest to the "clinical premium" direction — every stat-card usage across the app (Dashboard, Analytics, anywhere else) uses this one component. Delete the two other implementations once nothing references them.
- **`components/messages/messages-tab-nav.tsx`** (exists): no changes to the component itself — the fix is making both pages that use it share the same page-width container (see Messages/Voice Messages row below).

## 3. Flagship pages (detailed treatment, already validated via mockup)

**Dashboard** (`app/(platform)/dashboard/page.tsx`, `components/dashboard/trainer-dashboard.tsx`): greeting + stat numbers fold into one gradient hero block (replacing the separate greeting banner + 4-box stat grid), background `linear-gradient(135deg, var(--primary), oklch(0.36 0.19 264))` (a deeper shade of the existing primary — no new hue introduced), white text on top. Today's Priorities gets a severity-colored left accent per row (`border-l-2`, red/amber/emerald matching the severity, using the new `--color-success` token for the low-severity/positive rows). This Week's Sessions stays full-width and prominent below the hero. Recent Feedback / Recent Messages / AI Insights collapse into **one tabbed card** instead of three stacked cards.

**Exercises** (`app/(platform)/exercises/page.tsx`, `components/exercises/exercise-filters.tsx`): Search + Difficulty stay inline; Body Region/Category/Muscle Group move behind a single "Filters" panel button, with active selections shown as removable chips below the bar. Exercise card grid adopts the foundation (Card component, `gap-6`, consistent padding).

**Clients** (`app/(platform)/clients/page.tsx`, `app/(platform)/clients/[id]/page.tsx`): list adopts `PageHeader` + `EmptyState` + foundation spacing. Detail page's adherence summary restyled to the Dashboard hero's compact inline-stat treatment (not 4 separate boxes) for cross-page consistency; tabs (Calendar/Programs/Messages) keep their current structure, restyled to the elevation/spacing rules.

## 4. Sidebar

`components/layout/sidebar.tsx`: subtle gradient depth on the sidebar background — `linear-gradient(180deg, var(--sidebar), oklch(0.15 0.04 264))` (a slightly deeper shade of the existing `--sidebar` navy, same hue, top to bottom) — and a left-accent-bar treatment for the active nav item (`border-l-2 border-sidebar-primary` on the active `Link`, in addition to the existing background tint), replacing today's plain background-tint-only highlight.

## 5. Rollout — every other page

All of these adopt the Section 1 foundation (type scale, spacing, elevation, Card-only, `PageHeader`, `EmptyState`, shared `StatCard` wherever a stat grid exists) directly, with the specific known issues below fixed as part of that pass:

| Page | Known issue to fix | Otherwise |
|---|---|---|
| `messages/page.tsx` | — | Adopt `PageHeader`, foundation spacing |
| `voice-messages/page.tsx` | **Narrow `max-w-2xl` centered layout vs. Messages' full-width — must match** | Adopt `PageHeader`, foundation spacing |
| `analytics/page.tsx` | **Raw div-cards instead of shared `StatCard`/`Card`** | Adopt `PageHeader` |
| `programs/page.tsx` | **`h1`/`text-3xl` outlier — move to `PageHeader`** | — |
| `programs/[id]/page.tsx`, `programs/[id]/edit/page.tsx`, `programs/new/page.tsx`, `programs/generate/page.tsx`, `programs/upload/page.tsx` | — | Adopt foundation |
| `assessments/page.tsx`, `assessments/new/page.tsx` | — | Adopt foundation |
| `exercises/[id]/page.tsx`, `exercises/[id]/edit/page.tsx`, `exercises/new/page.tsx`, `exercises/bulk-import/page.tsx` | — | Adopt foundation |
| `clients/[id]/adherence/page.tsx`, `clients/[id]/outcomes/page.tsx`, `clients/[id]/progress/page.tsx`, `clients/[id]/sessions/[sessionId]/page.tsx` | — | Adopt foundation |
| `messages/[threadId]/page.tsx` | — | Adopt foundation |
| `sessions/[id]/page.tsx` | — | Adopt foundation |
| `settings/page.tsx`, `settings/billing/page.tsx`, `settings/audit-log/page.tsx`, `settings/clinic/page.tsx` | — | Adopt foundation |

`check-ins/**` and `habits/**`: left untouched (hidden, unreachable, prior deliberate decision).

## Testing

This is a visual/markup pass with no new business logic — verification is: `npx tsc --noEmit` clean, existing test suite still green (no behavior changed), and a browser pass through every page in the table confirming the header/spacing/card/empty-state conventions are actually applied and nothing regressed functionally (forms still submit, tabs still switch, links still navigate).

## Non-goals

No new features. No data/schema changes. No changes to business logic, only presentation. `/admin/**` untouched.
