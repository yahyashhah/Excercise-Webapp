# Copy-Paste (Ctrl+C / Ctrl+V) for Program Builder

**Date:** 2026-06-09  
**Status:** Approved  
**Scope:** Program create, program edit, calendar workout editor

---

## Overview

Replace the current in-place duplicate buttons with a keyboard-driven clipboard system that lets coaches copy exercises, blocks, and entire workout days and paste them anywhere — including into different programs. Modeled after TrueCoach and similar fitness platforms.

---

## Data Model

### Clipboard Payload

```ts
type ClipboardPayload =
  | { type: 'workout';   data: WorkoutInput }
  | { type: 'block';     data: WorkoutBlockInput }
  | { type: 'exercises'; data: BlockExerciseInput[] }
```

All `id` fields are stripped at copy time so pasted items are always treated as new records on save.

### Selection State (in-memory, per ProgramBuilder instance)

```ts
interface SelectionState {
  level: 'workout' | 'block' | 'exercises' | null
  workoutIdx: number | null
  blockIdx: number | null
  exerciseIdxs: Set<number>
}
```

Only one level is active at a time. Selecting a different level clears the previous selection.

---

## Clipboard Hierarchy

The paste target must be one level above the copied content:

| Clipboard holds | How to paste | Result |
|---|---|---|
| `workout` | Ctrl+V anywhere in the builder (no focused target needed) | New workout day appended at the end |
| `block` | Click a workout day header to focus it → Ctrl+V | Block appended to that day |
| `exercises` | Click a block header to focus it → Ctrl+V | Exercises appended to that block |

---

## How Selection Works

| Action | Selection level set |
|---|---|
| Click the workout day `CardHeader` area (not the name input or delete button) | `workout` — entire day selected |
| Click the block header row (not the block name input or type dropdown) | `block` — that block selected |
| Hover exercise row → checkbox appears → check it | `exercises` — checked exercise(s) selected |
| Click outside / press Escape | Selection cleared |

Selecting at one level clears selections at all other levels.

---

## Keyboard Shortcuts

Registered at the `ProgramBuilder` level via a `useBuilderKeyboard` hook:

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd+C` | Read current selection → copy to clipboard → show toast |
| `Ctrl/Cmd+V` | Read clipboard type + focused target → append cloned data |
| `Escape` | Clear selection (remove highlights, uncheck exercises) |

Shortcuts are only active when the builder is mounted (not in form inputs). Standard guard: if `event.target` is an `<input>`, `<textarea>`, or `[contenteditable]`, skip the handler entirely so typing in name fields is unaffected.

---

## Context API

### `ClipboardContext` (`lib/clipboard-context.tsx`)

Global context, wrapped at `app/layout.tsx`. Syncs to `localStorage` so clipboard survives navigation between programs.

```ts
interface ClipboardContextValue {
  clipboard: ClipboardPayload | null
  copy: (payload: ClipboardPayload) => void
  clear: () => void
}
```

localStorage key: `program-builder-clipboard`. Value is JSON-serialized `ClipboardPayload | null`.

On mount, reads from localStorage to restore clipboard. On `copy()` and `clear()`, writes back to localStorage.

---

## Visual Feedback

### Selection Highlights

| Element | Visual |
|---|---|
| Selected workout day card | `ring-2 ring-blue-500` around the card |
| Selected block | `ring-2 ring-blue-400` around the block container |
| Checked exercise row | Checkbox checked + `bg-blue-50` row background |

### Exercise Checkboxes

A checkbox fades in on the left of each exercise row on hover. Once any exercise is checked, all checkboxes stay visible until Escape or selection is cleared.

### Clipboard Toast

A fixed chip at the bottom-center of the screen while clipboard has content:

```
[ ✂ "Upper Body" block copied   × ]
```

Shows the type and name of what's copied. The `×` button clears the clipboard. Disappears when clipboard is empty.

### Paste Affordance

When clipboard has content and the user hovers over a valid paste target, the target renders a dashed blue border + subtle "Paste here" label:

- Workout day header → valid target when clipboard holds `block`
- Block header → valid target when clipboard holds `exercises`
- Any position in builder → valid target when clipboard holds `workout`

---

## Files Changed

### New files

| File | Purpose |
|---|---|
| `lib/clipboard-context.tsx` | `ClipboardContext`, `ClipboardProvider`, `useClipboard` hook, localStorage sync |
| `hooks/use-builder-keyboard.ts` | Ctrl+C / Ctrl+V / Escape keyboard wiring for the builder |

### Modified files

| File | Change |
|---|---|
| `app/layout.tsx` | Wrap children with `<ClipboardProvider>` |
| `components/programs/program-builder.tsx` | Add `useProgramSelection` state, `useBuilderKeyboard` hook, selection visual indicators, exercise checkboxes, paste affordance on hover, remove old duplicate Copy icon buttons |
| `components/calendar/workout-editor-panel.tsx` | Same selection + keyboard hook additions as `program-builder.tsx`; remove existing Copy icon buttons |

---

## Removed

The existing `Copy` icon (`<Copy className="h-3 w-3" />`) buttons on exercise rows and block headers are removed. The new keyboard-driven clipboard replaces this entirely.

---

## Out of Scope

- Saving clipboard as a named template (separate feature)
- Multi-level undo/redo for paste operations
- Cross-tab clipboard (browser native clipboard API)
