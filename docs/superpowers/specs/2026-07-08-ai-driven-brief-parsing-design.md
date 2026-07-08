# AI-Driven Program Document Parsing — Design

**Goal:** Replace the regex/heuristic document parser in `lib/services/program-brief.service.ts` with an AI-driven extraction pipeline so uploading a program document (docx/PDF) generates a correct multi-week program regardless of the document's structure, terminology, or formatting — not just documents that happen to match a specific template. Missing or ambiguous required information gets inferred and flagged for the trainer to review, rather than silently guessed or silently dropped.

## Background

A recent bug fix (see git history on `lib/services/program-brief.service.ts`) traced a "program only creates 1 week" report to three compounding issues: `mammoth.extractRawText()` silently drops Word soft line-breaks, the strict header-based parser short-circuits before ever reading the day-by-day body content, and the day/block-detection regexes only recognized a narrow set of keyword/format variants (`DAY 1` but not `DAY_1`, a fixed block-header keyword list that didn't include "Strength Block A" or "Accessory", etc.). That fix patched the specific document, but the underlying architecture — hand-written regexes trying to recognize session/day/block boundaries in free-form text — is inherently brittle. Every new trainer template with different wording breaks it again. This spec replaces that architecture rather than continuing to patch it.

## Requirements (from stakeholder decisions)

- Must correctly parse **any** text-based docx/PDF structure — tables, bullets, prose, numbered lists, arbitrary section terminology. Scanned/image PDFs (OCR/vision) are explicitly **out of scope**.
- No upper limit on program size (weeks × days) — must handle short single-week templates and arbitrarily long multi-week/phase programs.
- When a named exercise doesn't closely match the exercise library: use the closest match so the program still generates complete, but **flag it** in the preview for the trainer to review/swap.
- When required metadata is missing/ambiguous (difficulty, duration, etc.): infer a reasonable value and **flag it as inferred**; never block the trainer from proceeding.
- Exercises in the generated program must always be real library-backed exercises (with videos/cues), never raw text copied from the document.

## Architecture

Pipeline stages, replacing the current flow end-to-end:

```
extractProgramBriefText (unchanged)
        │
        ▼
metadata pass (1 AI call)  ──────────────► programTitle, focusAreas, difficultyLevel,
        │                                   durationMinutes, preferredWeekdays,
        │                                   inferredFields[]
        ▼
chunk split (local, no AI)
        │
        ▼
per-chunk extraction (N AI calls, capped concurrency)
        │
        ▼
merge (local) ──────────────────────────► ordered session list, weekIndex/dayIndex
        │
        ▼
exercise resolution (existing resolveExerciseByName, reused)
        │
        ▼
warnings aggregation ───────────────────► surfaced in the program preview screen
        │
        ▼
generateWorkoutPlan / createProgramFromGeneratedPlan (unchanged)
```

### 1. Text extraction — unchanged
`extractProgramBriefText` already converts docx via `mammoth.convertToHtml` + a line-break-preserving HTML-to-text pass, and PDFs via `pdf-parse`. No changes.

### 2. Metadata pass (1 AI call)
Single OpenAI call using strict `json_schema` structured output (not today's loose `json_object` mode) over the full document text, returning:

```ts
type BriefMetadata = {
  programTitle: string;
  focusAreas: string[];
  difficultyLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  durationMinutes: number;
  preferredWeekdays: string[];
  inferredFields: string[]; // names of fields not explicitly stated in the doc
};
```

This fully replaces the strict header parser (`parseProgramBrief`) and the regex metadata guessers (`inferProgramTitle`, `inferDifficulty`, `inferFocusAreasFromText`, `inferDurationMinutes`). One path instead of two — this also removes the "strict path silently succeeds on bad data" failure mode that caused the original bug (a spuriously-valid header block hid the real day/week content).

`daysPerWeek` is deliberately **not** part of this schema — it's derived later from what the chunk-extraction pass actually finds (see Merge), since assuming a fixed days/week up front is exactly the assumption that breaks on irregular documents.

### 3. Chunk split (local, no AI cost)
A pure function: `splitIntoChunks(text: string): string[]`.

- Primary strategy: scan paragraphs for section-boundary lines matching a generic pattern like `/^(week|phase|month|cycle|block)\s+\d+/i`. If ≥2 such boundaries are found, each boundary starts a new chunk (one chunk ≈ one week/phase's content).
- Size ceiling: any chunk exceeding ~8,000 characters (~2,000 tokens) is further sub-split on paragraph boundaries, so no single AI call is ever overwhelmed regardless of how the document is organized. This is what makes "no upper limit" practical — a 4-week doc is 1 chunk, a 52-week doc is many.
- Fallback strategy: if no section-boundary lines exist at all (flat "Day 1...Day N" list, free-form prose), split purely by the size ceiling, always breaking at a paragraph edge, never mid-exercise-list.
- Chunks never overlap in content, but each chunk's prompt (assembled in stage 4) includes light continuity context from the previous chunk's last extracted session.

### 4. Per-chunk extraction (N AI calls, concurrency capped at 4)
Each chunk is sent to the AI with a system prompt instructing it to extract every distinct training session present, in order, without inventing or skipping content. Strict `json_schema` output:

```ts
type ChunkExtraction = {
  sessions: {
    weekLabel: string | null;   // e.g. "Week 1", "Deload Week" — verbatim from the doc, or null
    dayLabel: string | null;    // e.g. "Day 1", "Monday" — verbatim from the doc, or null
    title: string;
    blocks: {
      name: string;
      focusType: "WARMUP" | "LOWER_BODY" | "UPPER_BODY" | "CORE" | "FULL_BODY"
                | "BALANCE" | "FLEXIBILITY" | "COOLDOWN" | "CARDIO";
      exercises: {
        name: string;
        sets: number | null;
        reps: number | null;
        durationSeconds: number | null;
        notes: string | null;
      }[];
    }[];
  }[];
  warnings: string[]; // e.g. "Day 3 had no explicit block labels; grouped as one block"
};
```

`focusType` is constrained to the app's existing allowed enum directly in the schema, replacing the keyword-guessing `inferCircuitFocusType`.

This fully replaces `extractSessionBlueprint` and everything under it: `isSessionTitleLine`, `isKnownBlockHeader`, `BLOCK_HEADER_PATTERNS`, `parseSegmentBlocks`, `parseExerciseFromLine`, the DAY-header regex passes (A/B/C), and `inferDaysFromText`.

Each chunk's prompt is dispatched with its index; calls run concurrently (capped at 4 in flight) but results are reassembled by index so document order is preserved regardless of completion order. A chunk's prompt also receives a short trailing-context string from the previous chunk's last session (e.g. "the previous chunk ended in Week 3, Day 2 — continue that week if this text does"), so numbering stays continuous across a chunk boundary that falls mid-week.

### 5. Merge (local)
- Concatenate all chunks' `sessions` arrays in chunk order.
- A session with a `null` `weekLabel` inherits the most recently seen non-null `weekLabel` (carry-forward). This matters because many real documents state "Week 2" once above the first day of that week and don't repeat it for every subsequent day — without carry-forward, those undecorated days would each look like their own isolated group.
- Group into weeks by `weekLabel` continuity (after carry-forward): a run of consecutive sessions sharing the same `weekLabel` is one week; a label change starts the next week. This preserves the document's own week identity (irregular week sizes, non-numeric names like "Deload Week") instead of assuming uniform days/week and dividing a flat session count — the exact class of bug that caused the original "1 week" issue.
- If **no** session anywhere has a `weekLabel` (nothing to carry forward), treat the whole document as a single week (a genuine single-week/day template) — no weeks get invented where none exist.
- `dayIndex` within a week = position within that week's group, in document order.
- Output shape matches the existing `SessionBlueprint[]` (`dayIndex`, `weekIndex`, `title`, `blocks`) so `generateWorkoutPlan`'s consumption of `params.sessionBlueprint` needs no changes.
- `GenerateWorkoutParams.daysPerWeek` (still a required field downstream, used only for exercise-pool sizing — `Math.max(80, daysPerWeek * exercisesPerSession)`) is derived post-merge as the largest day-count found in any single week group. It is no longer used to *determine* week boundaries (that's `weekLabel`'s job now) — only to size the exercise pool, so an irregular document (e.g. a 4-day week followed by a 3-day deload week) doesn't undersize the pool.
- `preferredWeekdays` is trimmed/padded to that derived `daysPerWeek`, same as today's existing logic.

### 6. Exercise resolution — reused, lightly extended
`resolveExerciseByName` in `ai.service.ts` (exact normalized match → similarity ranking → AI-assisted disambiguation) is reused as-is. It's extended to additionally report a match type:

```ts
type ResolvedExercise = { exercise: Exercise | null; matchType: "exact" | "fuzzy" | "none" };
```

- `matchType === "fuzzy"` → warning: `"'{docName}' matched to library exercise '{libraryName}' — please confirm this is correct."`
- `matchType === "none"` → warning: `"'{docName}' has no matching exercise in the library and was skipped from {sessionTitle}."`

### 7. Warnings aggregation and UI surfacing
All warnings — `inferredFields` from stage 2, `warnings` from each chunk in stage 4, and match-type warnings from stage 6 — merge into one `warnings: string[]` on the parsed result. `ProgramBriefParsed` gains a `warnings?: string[]` field. `generateProgramPreviewFromBriefAction` (`actions/program-actions.ts`) already returns `{ aiPlan, params, parsed }` to the frontend before save; `warnings` is added to that response. Whichever component renders that preview (the consumer of `generateProgramPreviewFromBriefAction`, alongside `program-brief-upload.tsx`) gets a non-blocking warnings panel listing them so the trainer can review/edit before saving — the exact component and its current layout will be confirmed at planning time so the panel matches existing UI conventions rather than being designed blind here.

## What gets removed vs. reused

**Removed:** `parseProgramBrief` (strict header parser), `extractSessionBlueprint` and its full regex apparatus, `inferProgramTitle`, `inferDifficulty`, `inferFocusAreasFromText`, `inferDurationMinutes`, `inferDaysFromText`, `inferCircuitFocusType`, and the final hard-fail `validate()` step. That last one no longer has a purpose: `validate()` existed to catch missing required fields, but the metadata pass's `json_schema` output guarantees every required field is present (the AI fills gaps via `inferredFields`, per the "never block" requirement) — there is no longer a failure path here, only warnings.

**Reused unchanged:** `extractProgramBriefText`, `resolveExerciseByName`/`pickClosestExerciseNameAI`, `generateWorkoutPlan`'s `sessionBlueprint` → exercise resolution path, `createProgramFromGeneratedPlan`. The `GenerateWorkoutParams.sessionBlueprint` contract is unchanged, so `ai.service.ts` only needs the match-type addition, not a rewrite.

**Net blast radius:** near-total rewrite of `program-brief.service.ts`, a small addition to `ai.service.ts`, warnings threaded through `actions/program-actions.ts`, and a small warnings panel added to the brief-upload preview UI.

## Edge cases and error handling

- A chunk's AI call fails or returns malformed/non-conforming JSON → retry once; if it still fails, that chunk degrades to a warning ("Couldn't parse content around position X — please review that section manually") rather than aborting the whole upload. Partial success beats total failure on a long document where one chunk out of many hiccups.
- Chunk concurrency capped at 4 in flight to avoid rate-limit spikes. No hard cap on chunk *count* (per the "no limit" requirement), but an unusually large chunk count (e.g. > 40, implying 250+ sessions) is logged server-side as a cost-visibility signal — not a block.
- Zero sessions detected after all chunks process → a clear user-facing error, consistent with the existing "No suitable exercises found" failure style, instead of silently saving an empty program.
- Cost/latency: today's flow already makes 1 AI call for non-strict-format documents. The new flow makes 1 (metadata) + N chunk calls (parallelized, capped at 4 concurrent) — a few extra seconds for a large document, not a UX-breaking wait. The preview screen's existing loading state should account for this.

## Testing plan

- `splitIntoChunks` is a pure function — unit test against synthetic structures: explicit "Week N" headers, a flat "Day N" list with no week concept, prose with no headers at all, mixed terminology, and documents just over/under the size ceiling, confirming no chunk ever splits mid-exercise.
- End-to-end re-run of the baseball 4-week docx used to diagnose the original bug, now against the new AI path, confirming 4 weeks × 4 days with correct exercises and no spurious warnings.
- Additional synthetic documents to validate "any structure": a single-week 3-day template with no week headers (must produce exactly 1 week, not invent more), a rehab-style document using prose instructions with no "circuits"/"blocks" vocabulary at all, a document with a deliberately unmatched exercise name (must produce a fuzzy-match warning), and a document with a deliberately missing required field (must produce an inferred-field warning).
- No existing automated test suite covers this file today; test setup will be confirmed during implementation planning rather than assumed.

## Out of scope

- Scanned/image PDFs (OCR or vision-model extraction).
- An embedding/retrieval layer for exercise matching (the existing fuzzy-match engine is reused as-is).
- Hard limits on program size — the design is chunk-based specifically to avoid needing one.
