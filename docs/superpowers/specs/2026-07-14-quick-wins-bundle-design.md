# Quick Wins Bundle — Design

Source: `~/Downloads/Edits_.docx` (first of 8 sub-projects scoped from that doc; see conversation for full decomposition). This is sub-project 1 of 8.

## Scope

1. Sidebar restructure (trainer nav)
2. Rename "Bulk Import" button to "Import"
3. Multi-select body region filter on the exercises page

Explicitly out of scope for this bundle (deferred to later sub-projects): Analytics nav item/page, exercise-phase filter bug investigation, muscle-group filter, universal-exercise adoption flow, client profile enhancements, session status automation, messaging upgrades, dashboard intelligence, business metrics, calendar integrations. URL domain typo (excercise-webapp.vercel.app) already fixed by user — not in scope.

## 1. Sidebar restructure

File: `components/layout/sidebar.tsx`.

- Reorder trainer nav items to: Dashboard, Clients, Programs, Exercises, Messages, Assessments, Billing, Settings, Audit Log.
- Unhide the existing (currently commented-out) Assessments link — the `/assessments` page is already fully built, this is just restoring the nav entry.
- No Analytics nav item added yet — that page doesn't exist for trainers yet and is a separate sub-project; adding a link now would 404 or need a placeholder, neither of which was wanted.
- Turn "Messages" into an expandable parent nav item with "Voice Messages" as a nested sub-link underneath it, replacing their current flat top-level/top-level arrangement. This requires:
  - Local expand/collapse state in the nav component (currently a flat list with no nesting concept).
  - The existing live unread-count badge on Voice Messages (`VoiceMessagesNavBadge`, Pusher-driven) carries over unchanged onto the nested sub-link.
  - Client-role sidebar is unaffected (Voice Messages is a trainer-only concept in the current nav).

## 2. Rename "Bulk Import" → "Import"

File: `app/(platform)/exercises/page.tsx`.

Change the button label only. Same href/behavior (`/exercises/bulk-import`).

## 3. Multi-select body region filter

Files: `components/exercises/exercise-filters.tsx`, `app/(platform)/exercises/page.tsx`, `lib/services/exercise.service.ts`.

- Replace the single-select `<select>` body-region dropdown with a multi-select pill row, matching the existing exercise-phase filter's visual style and toggle interaction (`exercise-filters.tsx:110-135`).
- URL query param changes from a single value (`bodyRegion=UPPER_BODY`) to a comma-separated list (`bodyRegion=UPPER_BODY,LOWER_BODY`), parsed the same way the phase filter already is (`.split(",")` in `exercises/page.tsx`).
- Prisma query in `exercise.service.ts` changes from exact-match (`{ bodyRegion: filters.bodyRegion }`) to `{ bodyRegion: { in: filters.bodyRegions } }`.
- No changes to the `BodyRegion` enum or schema — this is a query/UI shape change only.

## Testing

- Sidebar: verify trainer nav order, Assessments link navigates correctly, Messages/Voice Messages expand-collapse and badge behavior, client nav unaffected.
- Exercises: verify selecting multiple body-region pills combines with OR semantics, combines correctly with existing phase-filter pills (AND across filter types), URL reflects selected pills and is shareable/bookmarkable, empty-selection falls back to "all regions" (existing default behavior).
- Button rename: visual check only.

## Non-goals

No data migration, no new dependencies, no schema changes.
