# De-pollute UI: Remove AI-Generated Visual Patterns

## Goal
Remove all visual patterns that signal "AI-generated app" and replace with clean, professional design. Keep only subtle semantic status colors (muted green/red/amber for functional status only).

## Global Constraints
- No logic changes — purely visual/CSS
- Keep subtle semantic status colors: muted green (COMPLETED), muted red (MISSED/PAINFUL), muted amber (IN_PROGRESS/WARNING) — these are functional, not decorative
- Replace with Tailwind design-system tokens: `bg-muted`, `text-muted-foreground`, `bg-primary`, `border-border`, `bg-card`
- No new dependencies
- TypeScript must not break (className changes only)
- Do NOT commit — user reviews and commits themselves

## Patterns to Eliminate

| Pattern | Replace With |
|---------|-------------|
| `border-l-4 border-{color} bg-{color}/50` | `border border-border rounded-md` |
| `bg-linear-to-r from-{color} to-{color}` on buttons | `bg-primary text-primary-foreground` |
| `bg-linear-to-br from-{color} via-{color} to-{color}` on hero sections | `bg-muted` or `bg-card` |
| Gradient avatar circles (`bg-linear-to-br from-blue-400 to-indigo-500`) | `bg-muted text-muted-foreground` |
| Colorful icon containers (`bg-blue-50 text-blue-600`) | `bg-muted text-muted-foreground` |
| Decorative colorful badges (non-status) | `variant="outline"` or `variant="secondary"` |
| `shadow-{color}/20` on gradient buttons | Remove or use `shadow-sm` |
| Gradient stat cards with colored borders | Clean `bg-card` with neutral icon container |

## Tasks

### Task 1: Left Colored Border Lines
**Files:** `components/progress/soap-notes-tab.tsx`, `components/progress/clinical-note-form.tsx`

Remove the `border-l-4 border-{color} bg-{color}/50` pattern from SOAP note sections (Subjective/Objective/Assessment/Plan/Private). Replace with `border border-border rounded-md`. Section identity comes from the label text alone. Also replace the colorful `<Badge>` labels (blue/emerald/amber/violet) in soap-notes-tab.tsx with neutral `variant="outline"` badges.

### Task 2: Gradient Buttons → Solid Primary
**Files:**
- `components/dashboard/trainer-dashboard.tsx` — "Generate Program" button
- `components/calendar/client-calendar.tsx` — "AI Generate" and "Assign Program" buttons
- `components/habits/add-habit-dialog.tsx` — DialogTrigger button
- `components/check-ins/assign-checkin-dialog.tsx` — submit button
- `components/programs/program-list-client.tsx` — "New Program" button
- `components/workout/workout-session-tracker.tsx` — 3 gradient buttons
- `components/workout/workout-checklist-tracker.tsx` — 2 gradient buttons

Replace all `bg-linear-to-r from-{color} to-{color}` and `bg-linear-to-br from-{color}...` on `<Button>` elements with `bg-primary text-primary-foreground hover:bg-primary/90`. Remove `shadow-{color}/20` and `shadow-{color}/25` from these buttons (use `shadow-sm` if a shadow is needed). Remove `border-0` when replacing gradient (the primary button has its own border style).

### Task 3: Gradient Hero/Header Sections
**Files:**
- `components/dashboard/client-dashboard.tsx` — large gradient banner (`from-blue-600 via-indigo-600 to-violet-600`)
- `components/workout/workout-session-tracker.tsx` — completion screen gradient header
- `components/workout/workout-checklist-tracker.tsx` — completion screen gradient circle icon container
- `components/workout/workout-mode-wrapper.tsx` — session start gradient banner

Replace gradient backgrounds on large sections with `bg-muted` (light mode friendly). For the completion/success screen icon container (currently `bg-linear-to-br from-emerald-500 to-teal-600`), use `bg-primary/10 text-primary` (or if it represents a success/done state specifically, `bg-emerald-500/15 text-emerald-700`).

### Task 4: Gradient Avatars → Neutral Solid
**Files:**
- `components/layout/sidebar.tsx` — app logo avatar circle
- `components/dashboard/trainer-dashboard.tsx` — client initials in session list
- `components/messages/messages-inbox-client.tsx` — user avatar gradient array + gradient avatar usage
- `components/voice-memo/VoiceMessagesFeed.tsx` — trainer avatar circle

Replace all gradient avatar circles with `bg-muted text-muted-foreground font-medium`. The messages inbox currently uses 6 different gradient colors to differentiate users — replace the gradient array entirely and use a single `bg-muted text-muted-foreground` for all.

### Task 5: Admin Stat Cards + Trainer Dashboard Icon Containers
**Files:**
- `components/admin/stat-card.tsx` — gradient card backgrounds + colored icon containers
- `components/dashboard/trainer-dashboard.tsx` — colored icon containers on stat cards (`bg-blue-50 text-blue-600`, `bg-emerald-50`, etc.)

In stat-card.tsx: remove the color-variant map's gradient backgrounds; use plain `bg-card border-border` for all cards. Replace colored icon containers (`bg-blue-500/10 text-blue-600`) with `bg-muted text-muted-foreground`.

In trainer-dashboard.tsx: the stat cards use `card.bg` and `card.iconColor`. Replace these with `bg-muted` and `text-muted-foreground`.

### Task 6: Decorative Colorful Badges
**Files:**
- `components/programs/program-list-client.tsx` — status badges (ACTIVE/DRAFT/etc.) and category/type badges
- `components/calendar/workout-editor-panel.tsx` — green "saved" badges  
- `components/admin/trainers-with-clients-table.tsx` — blue trainer badge, cyan client badge

**Keep** (subtle semantic): the feedback/session status badges in `trainer-dashboard.tsx` (`COMPLETED` muted green, `MISSED` muted red, `SCHEDULED` muted neutral, `IN_PROGRESS` muted amber) — these are functional status indicators.

**Replace** decorative/category badges:
- Program status badges (ACTIVE/DRAFT/TEMPLATE) → `variant="secondary"` (neutral)
- Program category/type labels → `variant="outline"` with default border
- The green "saved" exercise badges in workout-editor-panel → remove entirely or show as plain text
- Admin trainer/client type badges → `variant="secondary"` or `variant="outline"` with default border/text

Also in trainer-dashboard feedbackColors: soften but keep semantic meaning — `FELT_GOOD` → `bg-emerald-500/10 text-emerald-700 border-emerald-200`, `PAINFUL` → `bg-red-500/10 text-red-700 border-red-200`, `MILD_DISCOMFORT` → `bg-amber-500/10 text-amber-700 border-amber-200`, `UNSURE_HOW_TO_PERFORM` → keep as muted neutral.
