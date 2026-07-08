# AI-Driven Program Document Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the regex/heuristic document parser in `lib/services/program-brief.service.ts` with an AI-driven extraction pipeline so uploading a program document generates a correct multi-week program regardless of its structure or terminology, with missing/ambiguous information inferred and flagged for the trainer instead of silently guessed or dropped.

**Architecture:** A metadata AI call extracts program-level fields (title, focus, difficulty, duration, weekdays) from the whole document. The document is split locally (no AI) into size-bounded chunks, primarily on "Week N"/"Phase N" boundaries. Each chunk is sent through a second AI call that extracts every session/block/exercise it contains as strict JSON. Chunk results are merged by week-label continuity (not by dividing a flat count), and warnings from every stage (inferred metadata fields, chunk ambiguities, fuzzy/missing exercise matches) surface in the existing program-preview screen.

**Tech Stack:** TypeScript, Next.js server actions, OpenAI Node SDK v6 (`response_format: { type: "json_schema" }` structured outputs), Prisma, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-08-ai-driven-brief-parsing-design.md`

## Global Constraints

- No OCR/vision-model support — text-based docx/PDF only (per spec's explicit out-of-scope).
- No hard cap on program size (weeks × days) — chunking must handle arbitrarily long documents.
- Unmatched exercises: use the closest library match and flag it — never silently drop, never block the trainer.
- Missing/ambiguous metadata: infer a value and flag it as inferred — never block the trainer.
- `lib/services/program-brief.service.ts` has `import "server-only"` at the top — any test file importing it (directly or transitively) must `vi.mock("server-only", () => ({}))` before importing the module, or the import throws.
- The `openai` package must be mocked in every test that imports `program-brief.service.ts` or `ai.service.ts` (both construct `new OpenAI({...})` at module load, which throws without a real-looking API key when unmocked).
- Match existing test conventions: Vitest with `globals: true` (but existing files still import `describe/it/expect/vi/beforeEach` explicitly — keep doing that), tests live in `__tests__` directories next to the module, mocks use `vi.mock('@/lib/prisma', ...)` for Prisma.
- Run tests with `npx vitest run <path>`.

---

### Task 1: `splitIntoChunks` — local, AI-free document chunking

**Files:**
- Modify: `lib/services/program-brief.service.ts`
- Create: `lib/services/__tests__/program-brief.service.test.ts`

**Interfaces:**
- Produces: `export function splitIntoChunks(text: string): string[]` — pure function, no AI, no I/O. Splits raw extracted document text into an array of substrings, each small enough for one AI extraction call. Later tasks (Task 6) call this directly.

This task only adds a new function alongside the existing file content — nothing existing is removed yet (removal happens in Task 6 once the new pipeline fully replaces the old one).

- [ ] **Step 1: Write the failing tests**

Create `lib/services/__tests__/program-brief.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
}))

import { splitIntoChunks } from '../program-brief.service'

describe('splitIntoChunks', () => {
  it('returns an empty array for empty text', () => {
    expect(splitIntoChunks('')).toEqual([])
    expect(splitIntoChunks('   \n\n  ')).toEqual([])
  })

  it('splits into one chunk per "Week N" boundary when 2+ boundaries exist', () => {
    const text = [
      'Week 1',
      'Day 1: Squat 4x8',
      'Day 2: Bench 4x8',
      'Week 2',
      'Day 1: Deadlift 4x6',
      'Day 2: Row 4x8',
      'Week 3',
      'Day 1: Overhead Press 4x8',
    ].join('\n\n')

    const chunks = splitIntoChunks(text)

    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toContain('Week 1')
    expect(chunks[0]).not.toContain('Week 2')
    expect(chunks[1]).toContain('Week 2')
    expect(chunks[1]).not.toContain('Week 3')
    expect(chunks[2]).toContain('Week 3')
  })

  it('keeps leading metadata paragraphs (before the first boundary) as their own chunk', () => {
    const text = [
      'PROGRAM_TITLE: Offseason Strength',
      'DIFFICULTY: Advanced',
      'Week 1',
      'Day 1: Squat 4x8',
      'Week 2',
      'Day 1: Deadlift 4x6',
    ].join('\n\n')

    const chunks = splitIntoChunks(text)

    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toContain('PROGRAM_TITLE')
    expect(chunks[0]).not.toContain('Week 1')
    expect(chunks[1]).toContain('Week 1')
    expect(chunks[2]).toContain('Week 2')
  })

  it('falls back to size-based splitting on paragraph boundaries when no Week/Phase boundaries exist', () => {
    const paragraph = 'Day 1: Squat 4x8, Bench 4x8, Row 4x8, Curl 3x12, Plank 3x30sec'
    // Repeat until comfortably over the 8000-character ceiling.
    const paragraphs = Array.from({ length: 200 }, (_, i) => `${paragraph} (session ${i})`)
    const text = paragraphs.join('\n\n')

    const chunks = splitIntoChunks(text)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(8000 + paragraph.length + 20)
    }
    // No paragraph content was dropped in the split.
    const rejoined = chunks.join('\n\n')
    for (let i = 0; i < 200; i++) {
      expect(rejoined).toContain(`(session ${i})`)
    }
  })

  it('returns a single chunk for short documents with no boundaries', () => {
    const text = 'Day 1: Squat 4x8\n\nDay 2: Bench 4x8'
    expect(splitIntoChunks(text)).toEqual(['Day 1: Squat 4x8\n\nDay 2: Bench 4x8'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/program-brief.service.test.ts`
Expected: FAIL — `splitIntoChunks is not a function` (or similar), since it doesn't exist yet.

- [ ] **Step 3: Implement `splitIntoChunks`**

In `lib/services/program-brief.service.ts`, add this function after the existing `normalizeText` function (which it reuses):

```ts
const CHUNK_SIZE_CEILING = 8000; // characters — keeps each AI extraction call comfortably small

export function splitIntoChunks(text: string): string[] {
  const paragraphs = normalizeText(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!paragraphs.length) return [];

  // Broad section-boundary heuristic: "Week 1", "Phase 2", "Cycle 3", etc.
  // This is a splitting hint only — it never has to be exhaustive, because the
  // per-chunk AI extraction (Task 5) is what actually identifies sessions.
  const boundaryPattern = /^(week|phase|month|cycle|block)\s+\d+/i;
  const boundaryIndices = paragraphs.reduce<number[]>((acc, p, i) => {
    if (boundaryPattern.test(p)) acc.push(i);
    return acc;
  }, []);

  let groups: string[][];
  if (boundaryIndices.length >= 2) {
    groups = [];
    if (boundaryIndices[0] > 0) {
      groups.push(paragraphs.slice(0, boundaryIndices[0]));
    }
    for (let g = 0; g < boundaryIndices.length; g++) {
      const start = boundaryIndices[g];
      const end = g + 1 < boundaryIndices.length ? boundaryIndices[g + 1] : paragraphs.length;
      groups.push(paragraphs.slice(start, end));
    }
  } else {
    // No reliable section boundaries — treat the whole document as one group,
    // then let the size ceiling below break it into paragraph-aligned chunks.
    groups = [paragraphs];
  }

  const chunks: string[] = [];
  for (const group of groups) {
    let current: string[] = [];
    let currentSize = 0;
    for (const para of group) {
      if (currentSize + para.length > CHUNK_SIZE_CEILING && current.length) {
        chunks.push(current.join('\n\n'));
        current = [];
        currentSize = 0;
      }
      current.push(para);
      currentSize += para.length;
    }
    if (current.length) chunks.push(current.join('\n\n'));
  }
  return chunks;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/program-brief.service.test.ts`
Expected: PASS — all 5 tests in the `splitIntoChunks` describe block pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/program-brief.service.ts lib/services/__tests__/program-brief.service.test.ts
git commit -m "feat(program-brief): add AI-free document chunk splitter"
```

---

### Task 2: Shared blueprint types + `mergeChunkSessions` + `deriveCircuitsFromSessions`

**Files:**
- Modify: `lib/services/program-brief.service.ts`
- Modify: `lib/services/__tests__/program-brief.service.test.ts`

**Interfaces:**
- Consumes: nothing new from Task 1.
- Produces:
  - `export type ExerciseBlueprint = { name: string; sets?: number; reps?: number; durationSeconds?: number; notes?: string }` (adds `notes` to the existing type)
  - `export type BlockBlueprint = { name: string; focusType: string; exercises: ExerciseBlueprint[] }` (adds `focusType`, drops the now-unused `sets` field that Task 3 confirms nothing reads)
  - `export type SessionBlueprint = { dayIndex: number; weekIndex?: number; title: string; blocks: BlockBlueprint[] }` (unchanged shape)
  - `export type RawSession = { weekLabel: string | null; dayLabel: string | null; title: string; blocks: BlockBlueprint[] }` — the AI's raw per-session output shape, before week/day indices are computed
  - `export type ChunkExtractionResult = { sessions: RawSession[]; warnings: string[] }` — one chunk's AI extraction output. Task 5 produces these; this task consumes them.
  - `export function mergeChunkSessions(chunkResults: ChunkExtractionResult[]): { sessionBlueprint: SessionBlueprint[]; daysPerWeek: number; warnings: string[] }`
  - `export function deriveCircuitsFromSessions(sessions: SessionBlueprint[]): CircuitConfig[]`

This task also **replaces** the existing `ExerciseBlueprint`, `BlockBlueprint`, `SessionBlueprint` type declarations in place (same names, updated shape) — later tasks build on these.

- [ ] **Step 1: Write the failing tests**

Add to `lib/services/__tests__/program-brief.service.test.ts` (below the existing `splitIntoChunks` describe block):

```ts
import { mergeChunkSessions, deriveCircuitsFromSessions } from '../program-brief.service'

function block(name: string, focusType: string, exerciseCount: number) {
  return {
    name,
    focusType,
    exercises: Array.from({ length: exerciseCount }, (_, i) => ({ name: `${name} exercise ${i}` })),
  }
}

describe('mergeChunkSessions', () => {
  it('groups sessions into weeks by weekLabel continuity, not by dividing a flat count', () => {
    const chunkResults = [
      {
        sessions: [
          { weekLabel: 'Week 1', dayLabel: 'Day 1', title: 'Lower A', blocks: [block('Warm Up', 'WARMUP', 2)] },
          { weekLabel: 'Week 1', dayLabel: 'Day 2', title: 'Upper A', blocks: [block('Warm Up', 'WARMUP', 2)] },
          { weekLabel: 'Week 2', dayLabel: 'Day 1', title: 'Lower A', blocks: [block('Warm Up', 'WARMUP', 2)] },
        ],
        warnings: [],
      },
    ]

    const { sessionBlueprint, daysPerWeek } = mergeChunkSessions(chunkResults)

    expect(sessionBlueprint.map((s) => [s.weekIndex, s.dayIndex, s.title])).toEqual([
      [0, 0, 'Lower A'],
      [0, 1, 'Upper A'],
      [1, 0, 'Lower A'],
    ])
    expect(daysPerWeek).toBe(2)
  })

  it('carries the last non-null weekLabel forward onto undecorated sessions', () => {
    const chunkResults = [
      {
        sessions: [
          { weekLabel: 'Week 2', dayLabel: 'Day 1', title: 'A', blocks: [] },
          { weekLabel: null, dayLabel: 'Day 2', title: 'B', blocks: [] },
          { weekLabel: null, dayLabel: 'Day 3', title: 'C', blocks: [] },
          { weekLabel: 'Week 3', dayLabel: 'Day 1', title: 'D', blocks: [] },
        ],
        warnings: [],
      },
    ]

    const { sessionBlueprint } = mergeChunkSessions(chunkResults)

    expect(sessionBlueprint.map((s) => s.weekIndex)).toEqual([0, 0, 0, 1])
  })

  it('treats a document with no weekLabel anywhere as a single week', () => {
    const chunkResults = [
      {
        sessions: [
          { weekLabel: null, dayLabel: 'Day 1', title: 'A', blocks: [] },
          { weekLabel: null, dayLabel: 'Day 2', title: 'B', blocks: [] },
          { weekLabel: null, dayLabel: 'Day 3', title: 'C', blocks: [] },
        ],
        warnings: [],
      },
    ]

    const { sessionBlueprint, daysPerWeek } = mergeChunkSessions(chunkResults)

    expect(sessionBlueprint.every((s) => s.weekIndex === 0)).toBe(true)
    expect(sessionBlueprint.map((s) => s.dayIndex)).toEqual([0, 1, 2])
    expect(daysPerWeek).toBe(3)
  })

  it('derives daysPerWeek as the largest week size for irregular week lengths', () => {
    const chunkResults = [
      {
        sessions: [
          { weekLabel: 'Week 1', dayLabel: null, title: 'A', blocks: [] },
          { weekLabel: 'Week 1', dayLabel: null, title: 'B', blocks: [] },
          { weekLabel: 'Week 1', dayLabel: null, title: 'C', blocks: [] },
          { weekLabel: 'Week 1', dayLabel: null, title: 'D', blocks: [] },
          { weekLabel: 'Week 2 (Deload)', dayLabel: null, title: 'E', blocks: [] },
          { weekLabel: 'Week 2 (Deload)', dayLabel: null, title: 'F', blocks: [] },
        ],
        warnings: [],
      },
    ]

    const { daysPerWeek } = mergeChunkSessions(chunkResults)
    expect(daysPerWeek).toBe(4)
  })

  it('concatenates warnings across all chunks and preserves chunk order', () => {
    const chunkResults = [
      { sessions: [{ weekLabel: null, dayLabel: null, title: 'A', blocks: [] }], warnings: ['warn-1'] },
      { sessions: [{ weekLabel: null, dayLabel: null, title: 'B', blocks: [] }], warnings: ['warn-2'] },
    ]

    const { sessionBlueprint, warnings } = mergeChunkSessions(chunkResults)
    expect(sessionBlueprint.map((s) => s.title)).toEqual(['A', 'B'])
    expect(warnings).toEqual(['warn-1', 'warn-2'])
  })

  it('returns an empty blueprint for a document with zero extracted sessions', () => {
    const result = mergeChunkSessions([{ sessions: [], warnings: ['nothing found'] }])
    expect(result.sessionBlueprint).toEqual([])
    expect(result.daysPerWeek).toBe(1)
    expect(result.warnings).toEqual(['nothing found'])
  })
})

describe('deriveCircuitsFromSessions', () => {
  it('takes the max exercise count per block name across all sessions', () => {
    const sessions = [
      { dayIndex: 0, weekIndex: 0, title: 'A', blocks: [block('Warm Up', 'WARMUP', 3)] },
      { dayIndex: 1, weekIndex: 0, title: 'B', blocks: [block('Warm Up', 'WARMUP', 5)] },
    ]

    const circuits = deriveCircuitsFromSessions(sessions)
    expect(circuits).toHaveLength(1)
    expect(circuits[0]).toMatchObject({ name: 'Warm Up', focusType: 'WARMUP', exerciseCount: 5 })
  })

  it('sets rounds to 1 for WARMUP/COOLDOWN and 3 for everything else', () => {
    const sessions = [
      {
        dayIndex: 0,
        weekIndex: 0,
        title: 'A',
        blocks: [block('Warm Up', 'WARMUP', 2), block('Cooldown', 'COOLDOWN', 2), block('Strength Block A', 'LOWER_BODY', 2)],
      },
    ]

    const circuits = deriveCircuitsFromSessions(sessions)
    const byName = Object.fromEntries(circuits.map((c) => [c.name, c.rounds]))
    expect(byName['Warm Up']).toBe(1)
    expect(byName['Cooldown']).toBe(1)
    expect(byName['Strength Block A']).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/program-brief.service.test.ts`
Expected: FAIL — `mergeChunkSessions`/`deriveCircuitsFromSessions` are not exported yet.

- [ ] **Step 3: Update types and implement both functions**

In `lib/services/program-brief.service.ts`, replace the existing type block:

```ts
export type ExerciseBlueprint = {
  name: string;
  sets?: number;
  reps?: number;
  durationSeconds?: number;
};

type BlockBlueprint = {
  name: string;
  sets?: number;
  exercises: ExerciseBlueprint[];
};

type SessionBlueprint = {
  dayIndex: number;
  weekIndex?: number;
  title: string;
  blocks: BlockBlueprint[];
};
```

with:

```ts
export type ExerciseBlueprint = {
  name: string;
  sets?: number;
  reps?: number;
  durationSeconds?: number;
  notes?: string;
};

export type BlockBlueprint = {
  name: string;
  focusType: string;
  exercises: ExerciseBlueprint[];
};

export type SessionBlueprint = {
  dayIndex: number;
  weekIndex?: number;
  title: string;
  blocks: BlockBlueprint[];
};

export type RawSession = {
  weekLabel: string | null;
  dayLabel: string | null;
  title: string;
  blocks: BlockBlueprint[];
};

export type ChunkExtractionResult = {
  sessions: RawSession[];
  warnings: string[];
};
```

Then add `mergeChunkSessions` and `deriveCircuitsFromSessions` after `splitIntoChunks`:

```ts
export function mergeChunkSessions(chunkResults: ChunkExtractionResult[]): {
  sessionBlueprint: SessionBlueprint[];
  daysPerWeek: number;
  warnings: string[];
} {
  const flatSessions = chunkResults.flatMap((c) => c.sessions);
  const warnings = chunkResults.flatMap((c) => c.warnings);

  if (!flatSessions.length) {
    return { sessionBlueprint: [], daysPerWeek: 1, warnings };
  }

  // Carry the last explicit weekLabel forward onto undecorated sessions — many
  // real documents state "Week 2" once and don't repeat it for every day under it.
  let lastWeekLabel: string | null = null;
  const withCarriedLabel = flatSessions.map((s) => {
    if (s.weekLabel) lastWeekLabel = s.weekLabel;
    return { ...s, weekLabel: s.weekLabel ?? lastWeekLabel };
  });

  const hasAnyWeekLabel = withCarriedLabel.some((s) => s.weekLabel !== null);

  const sessionBlueprint: SessionBlueprint[] = [];
  let weekIndex = 0;
  let dayIndex = 0;
  let currentLabel: string | null = null;
  let seenFirst = false;

  for (const s of withCarriedLabel) {
    if (hasAnyWeekLabel) {
      if (!seenFirst || s.weekLabel !== currentLabel) {
        if (seenFirst) weekIndex += 1;
        currentLabel = s.weekLabel;
        dayIndex = 0;
        seenFirst = true;
      }
    }
    sessionBlueprint.push({
      dayIndex,
      weekIndex: hasAnyWeekLabel ? weekIndex : 0,
      title: s.title,
      blocks: s.blocks,
    });
    dayIndex += 1;
  }

  const perWeekCount = new Map<number, number>();
  for (const s of sessionBlueprint) {
    const w = s.weekIndex ?? 0;
    perWeekCount.set(w, (perWeekCount.get(w) ?? 0) + 1);
  }
  const daysPerWeek = Math.max(1, ...Array.from(perWeekCount.values()));

  return { sessionBlueprint, daysPerWeek, warnings };
}

export function deriveCircuitsFromSessions(sessions: SessionBlueprint[]): CircuitConfig[] {
  const byName = new Map<string, { focusType: string; exerciseCount: number }>();
  for (const session of sessions) {
    for (const block of session.blocks) {
      const existing = byName.get(block.name);
      const count = block.exercises.length;
      if (!existing) {
        byName.set(block.name, { focusType: block.focusType, exerciseCount: count });
      } else if (count > existing.exerciseCount) {
        existing.exerciseCount = count;
      }
    }
  }
  return Array.from(byName.entries()).map(([name, { focusType, exerciseCount }]) => ({
    name,
    focusType,
    exerciseCount,
    rounds: focusType === 'WARMUP' || focusType === 'COOLDOWN' ? 1 : 3,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/program-brief.service.test.ts`
Expected: PASS — all tests including the new `mergeChunkSessions`/`deriveCircuitsFromSessions` blocks pass. (The old `parseProgramBrief`/`parseProgramBriefFlexible` functions elsewhere in the file still reference `BlockBlueprint`'s old `sets` field and will now fail to typecheck — that's expected and gets resolved in Task 6 when those functions are removed. Confirm this by running `npx tsc --noEmit` and seeing errors ONLY in `program-brief.service.ts` referencing the soon-to-be-deleted functions, not in the new code.)

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep program-brief`
Expected: errors pointing at lines inside `parseSegmentBlocks`/`parseCircuits`/old code (to be deleted in Task 6) — no errors inside `splitIntoChunks`, `mergeChunkSessions`, or `deriveCircuitsFromSessions`.

- [ ] **Step 5: Commit**

```bash
git add lib/services/program-brief.service.ts lib/services/__tests__/program-brief.service.test.ts
git commit -m "feat(program-brief): add week-label-based session merging and circuit derivation"
```

---

### Task 3: Exercise resolution — match-type reporting, dead-code removal, and warnings propagation

**Files:**
- Modify: `lib/services/ai.service.ts`
- Create: `lib/services/__tests__/ai.service.test.ts`

**Interfaces:**
- Produces: `export async function resolveExerciseByName(name: string, candidates: Exercise[]): Promise<{ exercise: Exercise | null; matchType: "exact" | "fuzzy" | "none" }>` — extracted from a closure inside `generateWorkoutPlan` into a standalone, independently testable function. `Exercise` is `@prisma/client`'s generated type.
- Modifies: `GeneratedPlan` and `GeneratedProgram` gain `warnings?: string[]`. `GenerateWorkoutParams` loses `preferredExerciseNames?: string[]` (confirmed dead: it's set only by the brief-upload flow, and only read inside the pool-building code this task proves is unreachable once `sessionBlueprint` is present).
- Also fixes a latent bug found while doing this work: today, `generateWorkoutPlan`'s `sessionBlueprint` branch sits *after* a pool-building block that can `throw` based on `preferredExerciseNames` matching — so a valid multi-week brief upload can fail before the (fully self-sufficient) `sessionBlueprint` branch ever runs. This task moves that branch earlier so it runs before the dead code, fixing the bug and removing a redundant `prisma.exercise.findMany` call in the same change.

- [ ] **Step 1: Write the failing test for `resolveExerciseByName`**

Create `lib/services/__tests__/ai.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { exercise: { findMany: vi.fn() }, user: { findUnique: vi.fn() } },
}))
vi.mock('@/lib/ai/utils/exercise-pool', () => ({
  filterByEquipment: vi.fn((pool: unknown[]) => pool),
}))

import { resolveExerciseByName } from '../ai.service'

function exercise(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ex1',
    name: 'Squat',
    bodyRegion: 'LOWER_BODY',
    difficultyLevel: 'BEGINNER',
    equipmentRequired: [],
    contraindications: [],
    description: null,
    musclesTargeted: [],
    exercisePhases: [],
    commonMistakes: null,
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSeconds: null,
    cuesThumbnail: null,
    videoUrl: null,
    isActive: true,
    ...overrides,
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveExerciseByName', () => {
  it('returns an exact match without calling AI', async () => {
    const squat = exercise({ name: 'Squat' })
    const result = await resolveExerciseByName('Squat', [squat])
    expect(result).toEqual({ exercise: squat, matchType: 'exact' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('matches case/punctuation-insensitively as exact', async () => {
    const squat = exercise({ name: 'Back Squat' })
    const result = await resolveExerciseByName('back-squat', [squat])
    expect(result).toEqual({ exercise: squat, matchType: 'exact' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('falls back to AI-assisted fuzzy match when no exact match exists', async () => {
    const bandPull = exercise({ id: 'ex2', name: 'Band Pull Apart' })
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ bestName: 'Band Pull Apart' }) } }],
    })
    const result = await resolveExerciseByName('Pull Apart Band', [bandPull])
    expect(result).toEqual({ exercise: bandPull, matchType: 'fuzzy' })
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('returns none when the candidate list is empty', async () => {
    const result = await resolveExerciseByName('Nonexistent Move', [])
    expect(result).toEqual({ exercise: null, matchType: 'none' })
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/services/__tests__/ai.service.test.ts`
Expected: FAIL — `resolveExerciseByName` is not exported from `ai.service.ts` yet.

- [ ] **Step 3: Extract and export `resolveExerciseByName`**

In `lib/services/ai.service.ts`, add `Exercise` to the existing Prisma type import:

```ts
import type { BodyRegion, Exercise } from "@prisma/client";
```

Add this exported function directly above `export async function generateWorkoutPlan(`:

```ts
export async function resolveExerciseByName(
  name: string,
  candidates: Exercise[]
): Promise<{ exercise: Exercise | null; matchType: "exact" | "fuzzy" | "none" }> {
  const normalizedTarget = normalizeExerciseName(name);
  const exact = candidates.find(
    (e) => normalizeExerciseName(e.name) === normalizedTarget
  );
  if (exact) return { exercise: exact, matchType: "exact" };

  const ranked = candidates
    .map((e) => ({
      exercise: e,
      score: scoreNameSimilarity(normalizeExerciseName(e.name), normalizedTarget),
    }))
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return { exercise: null, matchType: "none" };

  const top = ranked.slice(0, 20).map((r) => r.exercise.name);
  const aiPick = await pickClosestExerciseNameAI(name, top);
  const best = candidates.find((e) => e.name === aiPick) ?? ranked[0].exercise;
  return { exercise: best, matchType: "fuzzy" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/services/__tests__/ai.service.test.ts`
Expected: PASS — all 4 tests pass.

- [ ] **Step 5: Move the `sessionBlueprint` branch earlier and wire it to the new function**

In `lib/services/ai.service.ts`, find the comment `// === END multi-week path ===` (marks the end of the `params.weekPlan` branch). Immediately after that line, insert the entire `if (params.sessionBlueprint?.length) { ... }` block, rewritten to use `resolveExerciseByName` and collect warnings:

```ts
  // === END multi-week path ===

  if (params.sessionBlueprint?.length) {
    const circuits = params.circuits || [];
    const circuitNameMap = new Map(
      circuits.map((c, idx) => [normalizeExerciseName(c.name), idx])
    );

    const allBriefExercises = await prisma.exercise.findMany({
      where: { isActive: true },
    });

    const warnings: string[] = [];

    // Map per-week dayIndex (0,1,2) → actual weekday index using preferredWeekdays
    // e.g. ["Monday","Wednesday","Friday"] → [0,2,4], so dayIndex 1 → Wednesday (2) not Tuesday (1)
    const preferredDayIndices = (params.preferredWeekdays ?? [])
      .map((d) => weekdayToIndex[d.toLowerCase().trim()])
      .filter((d): d is number => Number.isInteger(d));

    function toActualDayOfWeek(dayIndex: number): number {
      if (preferredDayIndices.length === 0) return dayIndex;
      return preferredDayIndices[dayIndex % preferredDayIndices.length];
    }

    const sessions = params.sessionBlueprint.map((s) => ({
      dayOfWeek: toActualDayOfWeek(s.dayIndex),
      weekIndex: s.weekIndex ?? 0,
      name: s.title,
    }));

    const exercisesOutput: GeneratedExercise[] = [];

    for (const session of params.sessionBlueprint) {
      let orderIndex = 0;
      for (let blockIdx = 0; blockIdx < session.blocks.length; blockIdx += 1) {
        const block = session.blocks[blockIdx];
        const blockKey = normalizeExerciseName(block.name);
        const circuitIndex =
          circuitNameMap.get(blockKey) ?? Math.min(blockIdx, Math.max(0, circuits.length - 1));

        for (const exerciseBp of block.exercises) {
          const { exercise, matchType } = await resolveExerciseByName(exerciseBp.name, allBriefExercises);
          if (!exercise) {
            warnings.push(
              `"${exerciseBp.name}" has no matching exercise in the library and was skipped from "${session.title}".`
            );
            continue;
          }
          if (matchType === "fuzzy") {
            warnings.push(
              `"${exerciseBp.name}" matched to library exercise "${exercise.name}" — please confirm this is correct.`
            );
          }

          // Prefer sets/reps from the brief; fall back to library defaults
          const sets = exerciseBp.sets ?? exercise.defaultSets ?? 3;
          const hasDuration =
            exerciseBp.durationSeconds != null ||
            (exerciseBp.reps == null && exercise.defaultHoldSeconds != null);
          const reps = hasDuration ? undefined : (exerciseBp.reps ?? exercise.defaultReps ?? 10);
          const durationSeconds =
            exerciseBp.durationSeconds ??
            (hasDuration ? (exercise.defaultHoldSeconds ?? undefined) : undefined);

          const focusType = circuits[circuitIndex]?.focusType?.toUpperCase();
          const phase =
            focusType === "WARMUP"
              ? "WARMUP"
              : focusType === "COOLDOWN"
                ? "COOLDOWN"
                : focusType === "FLEXIBILITY"
                  ? "MOBILITY"
                  : focusType === "CARDIO"
                    ? "ACTIVATION"
                    : focusType === "BALANCE"
                      ? "ACTIVATION"
                      : "STRENGTHENING";

          exercisesOutput.push({
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            phase,
            circuitIndex,
            sets,
            reps,
            durationSeconds,
            restSeconds: undefined,
            weekIndex: session.weekIndex ?? 0,
            dayOfWeek: toActualDayOfWeek(session.dayIndex),
            orderIndex: orderIndex++,
            notes: exerciseBp.notes ?? undefined,
          });
        }
      }
    }

    const programTitle =
      params.programTitle ||
      params.trainerPrompt?.split("\n")?.[0]?.replace(/^Program title:\s*/i, "").trim() ||
      "Athletic Program";

    return {
      title: programTitle,
      description: "Generated from uploaded brief",
      sessions,
      exercises: exercisesOutput,
      warnings,
    };
  }
```

Then delete the now-duplicate original block that used to live later in the function — find and remove this entire block (it starts right after the `exercises.length === 0` throw and ends at the matching closing `}` before `const systemPrompt = ` for the general AI-generation path):

```ts
  if (params.sessionBlueprint?.length) {
    const circuits = params.circuits || [];
    const circuitNameMap = new Map(
      circuits.map((c, idx) => [normalizeExerciseName(c.name), idx])
    );

    const allBriefExercises = await prisma.exercise.findMany({
      where: { isActive: true },
    });

    async function resolveExerciseByName(name: string) {
      const normalizedTarget = normalizeExerciseName(name);
      const exact = allBriefExercises.find(
        (e) => normalizeExerciseName(e.name) === normalizedTarget
      );
      if (exact) return exact;

      const ranked = allBriefExercises
        .map((e) => ({
          exercise: e,
          score: scoreNameSimilarity(normalizeExerciseName(e.name), normalizedTarget),
        }))
        .sort((a, b) => b.score - a.score);

      if (!ranked.length) return null;

      const top = ranked.slice(0, 20).map((r) => r.exercise.name);
      const aiPick = await pickClosestExerciseNameAI(name, top);
      const best = allBriefExercises.find((e) => e.name === aiPick);
      return best ?? ranked[0].exercise;
    }

    // Map per-week dayIndex (0,1,2) → actual weekday index using preferredWeekdays
    // e.g. ["Monday","Wednesday","Friday"] → [0,2,4], so dayIndex 1 → Wednesday (2) not Tuesday (1)
    const preferredDayIndices = (params.preferredWeekdays ?? [])
      .map((d) => weekdayToIndex[d.toLowerCase().trim()])
      .filter((d): d is number => Number.isInteger(d));

    function toActualDayOfWeek(dayIndex: number): number {
      if (preferredDayIndices.length === 0) return dayIndex;
      return preferredDayIndices[dayIndex % preferredDayIndices.length];
    }

    const sessions = params.sessionBlueprint.map((s) => ({
      dayOfWeek: toActualDayOfWeek(s.dayIndex),
      weekIndex: s.weekIndex ?? 0,
      name: s.title,
    }));

    const exercisesOutput: GeneratedExercise[] = [];

    for (const session of params.sessionBlueprint) {
      let orderIndex = 0;
      for (let blockIdx = 0; blockIdx < session.blocks.length; blockIdx += 1) {
        const block = session.blocks[blockIdx];
        const blockKey = normalizeExerciseName(block.name);
        const circuitIndex =
          circuitNameMap.get(blockKey) ?? Math.min(blockIdx, Math.max(0, circuits.length - 1));

        for (const exerciseBp of block.exercises) {
          const exercise = await resolveExerciseByName(exerciseBp.name);
          if (!exercise) {
            console.warn(`[Brief] No exercises in library, skipping: ${exerciseBp.name}`);
            continue;
          }

          // Prefer sets/reps from the brief; fall back to library defaults
          const sets = exerciseBp.sets ?? exercise.defaultSets ?? 3;
          const hasDuration =
            exerciseBp.durationSeconds != null ||
            (exerciseBp.reps == null && exercise.defaultHoldSeconds != null);
          const reps = hasDuration ? undefined : (exerciseBp.reps ?? exercise.defaultReps ?? 10);
          const durationSeconds =
            exerciseBp.durationSeconds ??
            (hasDuration ? (exercise.defaultHoldSeconds ?? undefined) : undefined);

          const focusType = circuits[circuitIndex]?.focusType?.toUpperCase();
          const phase =
            focusType === "WARMUP"
              ? "WARMUP"
              : focusType === "COOLDOWN"
                ? "COOLDOWN"
                : focusType === "FLEXIBILITY"
                  ? "MOBILITY"
                  : focusType === "CARDIO"
                    ? "ACTIVATION"
                    : focusType === "BALANCE"
                      ? "ACTIVATION"
                      : "STRENGTHENING";

          exercisesOutput.push({
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            phase,
            circuitIndex,
            sets,
            reps,
            durationSeconds,
            restSeconds: undefined,
            weekIndex: session.weekIndex ?? 0,
            dayOfWeek: toActualDayOfWeek(session.dayIndex),
            orderIndex: orderIndex++,
            notes: undefined,
          });
        }
      }
    }

    const programTitle =
      params.programTitle ||
      params.trainerPrompt?.split("\n")?.[0]?.replace(/^Program title:\s*/i, "").trim() ||
      "Athletic Program";

    return {
      title: programTitle,
      description: "Generated from uploaded brief",
      sessions,
      exercises: exercisesOutput,
    };
  }

```

Then simplify the now-dead `preferredExerciseNames` filtering that this removal exposes. Find:

```ts
  let filteredForBrief = filtered;
  const preferredNames = (params.preferredExerciseNames || [])
    .map((n) => n.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
    .filter(Boolean);

  if (preferredNames.length) {
    filteredForBrief = filtered.filter((e) => {
      const exerciseName = e.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!exerciseName) return false;
      return preferredNames.some(
        (n) => exerciseName === n || exerciseName.includes(n) || n.includes(exerciseName)
      );
    });
  }

  // Pool must be large enough so the AI can pick unique exercises across all days
  const exercisesPerSession = params.circuits?.length
    ? params.circuits.reduce((sum, c) => sum + c.exerciseCount, 0)
    : (params.exercisesPerSession ?? 15);
  const exercisePoolLimit = Math.max(80, params.daysPerWeek * exercisesPerSession);
  const exercises = filteredForBrief.slice(0, exercisePoolLimit);

  if (exercises.length === 0) {
    throw new Error(
      preferredNames.length
        ? "No exercises from the brief matched your library. Please check exercise names."
        : "No suitable exercises found for the given focus areas and client profile."
    );
  }
```

Replace with:

```ts
  // Pool must be large enough so the AI can pick unique exercises across all days
  const exercisesPerSession = params.circuits?.length
    ? params.circuits.reduce((sum, c) => sum + c.exerciseCount, 0)
    : (params.exercisesPerSession ?? 15);
  const exercisePoolLimit = Math.max(80, params.daysPerWeek * exercisesPerSession);
  const exercises = filtered.slice(0, exercisePoolLimit);

  if (exercises.length === 0) {
    throw new Error("No suitable exercises found for the given focus areas and client profile.");
  }
```

Finally, remove the now-unused `preferredExerciseNames?: string[];` line from the `GenerateWorkoutParams` interface, and add `notes?: string` to that same interface's inline `sessionBlueprint` exercise type (needed because Step 5 now reads `exerciseBp.notes`). Find:

```ts
  preferredExerciseNames?: string[];
  sessionBlueprint?: {
    dayIndex: number;
    weekIndex?: number;
    title: string;
    blocks: {
      name: string;
      sets?: number;
      exercises: { name: string; sets?: number; reps?: number; durationSeconds?: number }[];
    }[];
  }[];
```

Replace with:

```ts
  sessionBlueprint?: {
    dayIndex: number;
    weekIndex?: number;
    title: string;
    blocks: {
      name: string;
      exercises: { name: string; sets?: number; reps?: number; durationSeconds?: number; notes?: string }[];
    }[];
  }[];
```

- [ ] **Step 6: Add `warnings?: string[]` to `GeneratedPlan` and `GeneratedProgram`, and propagate through `generateProgram`**

Find:

```ts
interface GeneratedPlan {
  title: string;
  description: string;
  sessions: { dayOfWeek: number; weekIndex?: number; name: string }[];
  exercises: GeneratedExercise[];
}
```

Replace with:

```ts
interface GeneratedPlan {
  title: string;
  description: string;
  sessions: { dayOfWeek: number; weekIndex?: number; name: string }[];
  exercises: GeneratedExercise[];
  warnings?: string[];
}
```

Find:

```ts
export interface GeneratedProgram {
  name: string;
  description?: string;
  workouts: GeneratedProgramWorkout[];
}
```

Replace with:

```ts
export interface GeneratedProgram {
  name: string;
  description?: string;
  workouts: GeneratedProgramWorkout[];
  warnings?: string[];
}
```

In `generateProgram`, find the final return statement:

```ts
  return {
    name: generatedPlan.title || "AI Generated Program",
    description: generatedPlan.description,
    workouts,
  };
}
```

Replace with:

```ts
  return {
    name: generatedPlan.title || "AI Generated Program",
    description: generatedPlan.description,
    workouts,
    warnings: generatedPlan.warnings,
  };
}
```

- [ ] **Step 7: Add a test proving the sessionBlueprint path no longer depends on `preferredExerciseNames` and reports warnings**

Add to `lib/services/__tests__/ai.service.test.ts`:

```ts
import { prisma } from '@/lib/prisma'
import { generateWorkoutPlan } from '../ai.service'

describe('generateWorkoutPlan (sessionBlueprint path)', () => {
  it('resolves exercises directly from sessionBlueprint and reports a fuzzy-match warning', async () => {
    const squat = exercise({ id: 'sq1', name: 'Back Squat', defaultSets: 4, defaultReps: 8 })
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([squat])
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ bestName: 'Back Squat' }) } }],
    })

    const result = await generateWorkoutPlan({
      durationMinutes: 60,
      daysPerWeek: 1,
      difficultyLevel: 'INTERMEDIATE',
      circuits: [{ name: 'Strength Block A', focusType: 'LOWER_BODY', exerciseCount: 1 }],
      preferredWeekdays: ['Monday'],
      sessionBlueprint: [
        {
          dayIndex: 0,
          weekIndex: 0,
          title: 'Lower Body A',
          blocks: [
            {
              name: 'Strength Block A',
              exercises: [{ name: 'Squat', sets: 4, reps: 8 }],
            },
          ],
        },
      ],
    } as any)

    expect(result.exercises).toHaveLength(1)
    expect(result.exercises[0].exerciseId).toBe('sq1')
    expect(result.warnings).toEqual([
      '"Squat" matched to library exercise "Back Squat" — please confirm this is correct.',
    ])
  })

  it('reports a warning and skips the exercise when nothing matches', async () => {
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([])

    const result = await generateWorkoutPlan({
      durationMinutes: 60,
      daysPerWeek: 1,
      difficultyLevel: 'INTERMEDIATE',
      circuits: [{ name: 'Strength Block A', focusType: 'LOWER_BODY', exerciseCount: 1 }],
      preferredWeekdays: ['Monday'],
      sessionBlueprint: [
        {
          dayIndex: 0,
          weekIndex: 0,
          title: 'Lower Body A',
          blocks: [{ name: 'Strength Block A', exercises: [{ name: 'Nonexistent Move' }] }],
        },
      ],
    } as any)

    expect(result.exercises).toHaveLength(0)
    expect(result.warnings).toEqual([
      '"Nonexistent Move" has no matching exercise in the library and was skipped from "Lower Body A".',
    ])
  })
})
```

- [ ] **Step 8: Run all ai.service tests and typecheck**

Run: `npx vitest run lib/services/__tests__/ai.service.test.ts`
Expected: PASS — all tests pass, including the two new `generateWorkoutPlan` tests.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep ai.service`
Expected: no output (no type errors in `ai.service.ts`).

- [ ] **Step 9: Commit**

```bash
git add lib/services/ai.service.ts lib/services/__tests__/ai.service.test.ts
git commit -m "fix(ai-service): make sessionBlueprint resolution match-aware and unreachable-throw-free"
```

---

### Task 4: `extractBriefMetadata` — AI metadata pass

**Files:**
- Modify: `lib/services/program-brief.service.ts`
- Modify: `lib/services/__tests__/program-brief.service.test.ts`

**Interfaces:**
- Consumes: `openai` (module-level client already declared in the file), `ALLOWED_DIFFICULTY`, `WEEKDAYS` (existing constants — `WEEKDAY_FALLBACK_ORDER` is a duplicate of `WEEKDAYS` and gets removed in Task 6; this task keeps using `WEEKDAYS`).
- Produces: `export type BriefMetadata = { programTitle: string; focusAreas: string[]; difficultyLevel: string; durationMinutes: number; preferredWeekdays: string[]; inferredFields: string[] }` and `export async function extractBriefMetadata(text: string): Promise<BriefMetadata>`. Task 6 calls this.

- [ ] **Step 1: Write the failing test**

Add to `lib/services/__tests__/program-brief.service.test.ts`:

```ts
import { extractBriefMetadata } from '../program-brief.service'

describe('extractBriefMetadata', () => {
  it('parses the AI response and clamps durationMinutes to a sane range', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              programTitle: 'Advanced Baseball Offseason Performance Program',
              focusAreas: ['power', 'lower body'],
              difficultyLevel: 'ADVANCED',
              durationMinutes: 999,
              preferredWeekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
              inferredFields: [],
            }),
          },
        },
      ],
    })

    const metadata = await extractBriefMetadata('some document text')

    expect(metadata.programTitle).toBe('Advanced Baseball Offseason Performance Program')
    expect(metadata.difficultyLevel).toBe('ADVANCED')
    expect(metadata.preferredWeekdays).toEqual(['Monday', 'Tuesday', 'Thursday', 'Friday'])
    expect(metadata.durationMinutes).toBe(180) // clamped to the 10-180 range
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: expect.objectContaining({ type: 'json_schema' }),
      })
    )
  })

  it('passes through inferredFields so the caller can flag them', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              programTitle: 'Untitled Program',
              focusAreas: [],
              difficultyLevel: 'BEGINNER',
              durationMinutes: 45,
              preferredWeekdays: ['Monday'],
              inferredFields: ['programTitle', 'focusAreas'],
            }),
          },
        },
      ],
    })

    const metadata = await extractBriefMetadata('a document with no clear title')
    expect(metadata.inferredFields).toEqual(['programTitle', 'focusAreas'])
  })
})
```

This test file needs a shared `mockCreate` — since Task 1's `vi.mock('openai', ...)` call used an inline `vi.fn()` that isn't referenced elsewhere, update the top of the file to hoist it so every describe block (including this new one) can configure it. Replace the top of `lib/services/__tests__/program-brief.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
}))
```

with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}))

beforeEach(() => {
  vi.clearAllMocks()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/services/__tests__/program-brief.service.test.ts`
Expected: FAIL — `extractBriefMetadata` is not exported yet.

- [ ] **Step 3: Implement `extractBriefMetadata`**

Add to `lib/services/program-brief.service.ts`, after `deriveCircuitsFromSessions`:

```ts
export type BriefMetadata = {
  programTitle: string;
  focusAreas: string[];
  difficultyLevel: string;
  durationMinutes: number;
  preferredWeekdays: string[];
  inferredFields: string[];
};

const BRIEF_METADATA_SCHEMA = {
  name: 'brief_metadata',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      programTitle: { type: 'string' },
      focusAreas: { type: 'array', items: { type: 'string' } },
      difficultyLevel: { type: 'string', enum: [...ALLOWED_DIFFICULTY] },
      durationMinutes: { type: 'number' },
      preferredWeekdays: { type: 'array', items: { type: 'string', enum: [...WEEKDAYS] } },
      inferredFields: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'programTitle',
      'focusAreas',
      'difficultyLevel',
      'durationMinutes',
      'preferredWeekdays',
      'inferredFields',
    ],
  },
} as const;

export async function extractBriefMetadata(text: string): Promise<BriefMetadata> {
  const systemPrompt = `You extract high-level program metadata from an uploaded training/exercise program document. The document may be for any context — rehabilitation, athletic performance, strength & conditioning, general fitness — and may use any structure, formatting, or terminology.

Return:
- programTitle: the program's name/title.
- focusAreas: 2-5 short focus area terms (e.g. "lower body", "power", "core").
- difficultyLevel: BEGINNER, INTERMEDIATE, or ADVANCED.
- durationMinutes: typical session length in minutes.
- preferredWeekdays: which weekdays training happens on. If not explicitly stated, choose a sensible default set matching the number of training days per week you can infer from the document.
- inferredFields: the field names above that were NOT explicitly stated in the document and had to be inferred. Leave empty if everything was explicit.

Never invent specific exercises here — only these five fields.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1000,
    response_format: { type: 'json_schema', json_schema: BRIEF_METADATA_SCHEMA },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
  });

  const raw = response.choices[0].message.content ?? '{}';
  const parsed = JSON.parse(raw) as BriefMetadata;
  return {
    ...parsed,
    durationMinutes: Math.min(180, Math.max(10, parsed.durationMinutes || 45)),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/program-brief.service.test.ts`
Expected: PASS — all tests including both new `extractBriefMetadata` tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/program-brief.service.ts lib/services/__tests__/program-brief.service.test.ts
git commit -m "feat(program-brief): add AI metadata extraction with structured output"
```

---

### Task 5: `extractChunkSessions` — per-chunk AI extraction

**Files:**
- Modify: `lib/services/program-brief.service.ts`
- Modify: `lib/services/__tests__/program-brief.service.test.ts`

**Interfaces:**
- Consumes: `ALLOWED_CIRCUIT_FOCUS` (existing constant), `RawSession`/`ChunkExtractionResult` (from Task 2).
- Produces: `export async function extractChunkSessions(chunk: string, chunkIndex: number, totalChunks: number, continuityNote: string | null): Promise<ChunkExtractionResult>`. Task 6 calls this once per chunk produced by `splitIntoChunks`.

- [ ] **Step 1: Write the failing test**

Add to `lib/services/__tests__/program-brief.service.test.ts`:

```ts
import { extractChunkSessions } from '../program-brief.service'

describe('extractChunkSessions', () => {
  it('parses the AI response into sessions and warnings', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sessions: [
                {
                  weekLabel: 'Week 1',
                  dayLabel: 'Day 1',
                  title: 'Lower Body A – Squat & Acceleration',
                  blocks: [
                    {
                      name: 'Warm Up',
                      focusType: 'WARMUP',
                      exercises: [
                        { name: 'Dynamic Mobility', sets: null, reps: null, durationSeconds: null, notes: null },
                        { name: 'A-Skips', sets: 2, reps: 20, durationSeconds: null, notes: null },
                      ],
                    },
                  ],
                },
              ],
              warnings: [],
            }),
          },
        },
      ],
    })

    const result = await extractChunkSessions('Week 1\nDAY_1: Lower Body A...', 0, 1, null)

    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0].weekLabel).toBe('Week 1')
    expect(result.sessions[0].blocks[0].exercises).toHaveLength(2)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: expect.objectContaining({ type: 'json_schema' }),
      })
    )
  })

  it('includes chunk position and continuity note in the prompt', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ sessions: [], warnings: [] }) } }],
    })

    await extractChunkSessions('chunk text', 2, 5, "The previous chunk's last session was: Week 3, Day 2.")

    const call = mockCreate.mock.calls[0][0]
    const systemMessage = call.messages.find((m: any) => m.role === 'system').content
    expect(systemMessage).toContain('chunk 3 of 5')
    expect(systemMessage).toContain("The previous chunk's last session was: Week 3, Day 2.")
  })

  it('defaults to an empty result if the AI returns unparseable content', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] })
    const result = await extractChunkSessions('chunk text', 0, 1, null)
    expect(result).toEqual({ sessions: [], warnings: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/services/__tests__/program-brief.service.test.ts`
Expected: FAIL — `extractChunkSessions` is not exported yet.

- [ ] **Step 3: Implement `extractChunkSessions`**

Add to `lib/services/program-brief.service.ts`, after `extractBriefMetadata`:

```ts
const CHUNK_EXTRACTION_SCHEMA = {
  name: 'chunk_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sessions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            weekLabel: { type: ['string', 'null'] },
            dayLabel: { type: ['string', 'null'] },
            title: { type: 'string' },
            blocks: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  focusType: { type: 'string', enum: [...ALLOWED_CIRCUIT_FOCUS] },
                  exercises: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        name: { type: 'string' },
                        sets: { type: ['number', 'null'] },
                        reps: { type: ['number', 'null'] },
                        durationSeconds: { type: ['number', 'null'] },
                        notes: { type: ['string', 'null'] },
                      },
                      required: ['name', 'sets', 'reps', 'durationSeconds', 'notes'],
                    },
                  },
                },
                required: ['name', 'focusType', 'exercises'],
              },
            },
          },
          required: ['weekLabel', 'dayLabel', 'title', 'blocks'],
        },
      },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['sessions', 'warnings'],
  },
} as const;

export async function extractChunkSessions(
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
  continuityNote: string | null
): Promise<ChunkExtractionResult> {
  const systemPrompt = `You extract every distinct training session from an excerpt of a program document. The document may use any structure or terminology — tables, bullets, numbered lists, prose, or a fixed template.

Rules:
- Extract every session in this excerpt, in the exact order they appear. Do not skip or merge sessions.
- For each session capture: weekLabel (verbatim label like "Week 1" or "Deload Week" if the excerpt states one for this session, else null), dayLabel (verbatim label like "Day 1" or "Monday" if stated, else null), title (the session's descriptive name), and blocks.
- Each block is a named section of the session (e.g. "Warm Up", "Strength Block A", "Accessory") containing an ordered list of exercises. Use the document's own section names — do not rename them.
- Classify each block's focusType as the closest match among: ${ALLOWED_CIRCUIT_FOCUS.join(', ')}.
- For each exercise capture: name (exact name from the document, no bullet markers), sets, reps, durationSeconds (for holds/timed work, instead of reps), and notes. Use null for anything not explicitly stated — never invent numbers.
- Do not include rest-period lines (e.g. "Rest: 45 sec") as exercises.
- Add an entry to "warnings" for anything ambiguous you had to guess at.

This is chunk ${chunkIndex + 1} of ${totalChunks}.${continuityNote ? ` ${continuityNote}` : ''} Continue any week/day numbering from where the previous chunk left off — do not restart it unless the document itself restarts it.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4000,
    response_format: { type: 'json_schema', json_schema: CHUNK_EXTRACTION_SCHEMA },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: chunk },
    ],
  });

  const raw = response.choices[0].message.content;
  if (!raw) return { sessions: [], warnings: [] };
  return JSON.parse(raw) as ChunkExtractionResult;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/__tests__/program-brief.service.test.ts`
Expected: PASS — all tests including the three new `extractChunkSessions` tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/program-brief.service.ts lib/services/__tests__/program-brief.service.test.ts
git commit -m "feat(program-brief): add per-chunk AI session extraction with structured output"
```

---

### Task 6: Orchestrator — replace `parseProgramBrief`/`parseProgramBriefFlexible` and delete the old regex pipeline

**Files:**
- Modify: `lib/services/program-brief.service.ts`
- Modify: `lib/services/__tests__/program-brief.service.test.ts`

**Interfaces:**
- Consumes: `splitIntoChunks`, `mergeChunkSessions`, `deriveCircuitsFromSessions`, `extractBriefMetadata`, `extractChunkSessions` (Tasks 1, 2, 4, 5).
- Produces: `export async function parseProgramBrief(text: string): Promise<ProgramBriefParseResult>` — single exported parsing entry point (replaces both old `parseProgramBrief` and `parseProgramBriefFlexible`). `ProgramBriefParsed` gains `warnings?: string[]` and drops `preferredExerciseNames?`, `subjective?`, `trainerPrompt?`, `additionalNotes?` (nothing in the new pipeline populates them, and nothing downstream reads them once every brief-upload document produces a `sessionBlueprint` — see Task 3).
- Removes (all now dead once the orchestrator no longer calls them): `parseHeaderSections`, `parseCircuits`, `normalizeWeekday`, `normalizeName`, `splitCommaList`, `validate`, `normalizeInferred`, `isSessionTitleLine`, `isKnownBlockHeader`, `BLOCK_HEADER_PATTERNS`, `blockNameFromHeader`, `isSeparatorLine`, `looksLikeExercise`, `parseExerciseFromLine`, `extractSessionBlueprint`, `inferDaysFromText`, `inferProgramTitle`, `inferDifficulty`, `inferFocusAreasFromText`, `inferDurationMinutes`, `inferCircuitFocusType`, `REQUIRED_HEADERS`, `OPTIONAL_HEADERS`, `ALL_HEADERS`, `HeaderKey`, `WEEKDAY_FALLBACK_ORDER` (duplicate of `WEEKDAYS`, consolidated to one constant).

- [ ] **Step 1: Write the failing tests**

Add to `lib/services/__tests__/program-brief.service.test.ts`:

```ts
import { parseProgramBrief } from '../program-brief.service'

describe('parseProgramBrief (orchestrator)', () => {
  it('produces a 4-week sessionBlueprint from a document split into 4 week chunks', async () => {
    mockCreate.mockImplementation((args: any) => {
      const userContent = args.messages[1].content as string
      if (args.response_format.json_schema.name === 'brief_metadata') {
        return Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  programTitle: 'Advanced Baseball Offseason Performance Program',
                  focusAreas: ['power', 'lower body'],
                  difficultyLevel: 'ADVANCED',
                  durationMinutes: 90,
                  preferredWeekdays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
                  inferredFields: [],
                }),
              },
            },
          ],
        })
      }
      // chunk extraction — one session per chunk, using the week number embedded in the chunk text
      const weekMatch = userContent.match(/Week (\d)/)
      const week = weekMatch ? weekMatch[1] : '1'
      return Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sessions: [
                  {
                    weekLabel: `Week ${week}`,
                    dayLabel: 'Day 1',
                    title: 'Lower Body A',
                    blocks: [
                      {
                        name: 'Warm Up',
                        focusType: 'WARMUP',
                        exercises: [{ name: 'Squat', sets: 4, reps: 8, durationSeconds: null, notes: null }],
                      },
                    ],
                  },
                  {
                    weekLabel: `Week ${week}`,
                    dayLabel: 'Day 2',
                    title: 'Upper Body A',
                    blocks: [
                      {
                        name: 'Warm Up',
                        focusType: 'WARMUP',
                        exercises: [{ name: 'Bench Press', sets: 4, reps: 8, durationSeconds: null, notes: null }],
                      },
                    ],
                  },
                ],
                warnings: [],
              }),
            },
          },
        ],
      })
    })

    const text = [
      'Week 1',
      'DAY_1: Lower Body A',
      'Week 2',
      'DAY_1: Lower Body A',
      'Week 3',
      'DAY_1: Lower Body A',
      'Week 4',
      'DAY_1: Lower Body A',
    ].join('\n\n')

    const result = await parseProgramBrief(text)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')
    expect(result.data.sessionBlueprint).toHaveLength(8)
    expect(result.data.daysPerWeek).toBe(2)
    expect(new Set(result.data.sessionBlueprint!.map((s) => s.weekIndex))).toEqual(new Set([0, 1, 2, 3]))
    expect(result.data.circuits).toEqual([
      { name: 'Warm Up', focusType: 'WARMUP', exerciseCount: 1, rounds: 1 },
    ])
  })

  it('surfaces inferred-metadata and chunk warnings together', async () => {
    mockCreate.mockImplementation((args: any) => {
      if (args.response_format.json_schema.name === 'brief_metadata') {
        return Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  programTitle: 'Untitled Program',
                  focusAreas: ['general fitness'],
                  difficultyLevel: 'BEGINNER',
                  durationMinutes: 45,
                  preferredWeekdays: ['Monday'],
                  inferredFields: ['programTitle', 'difficultyLevel'],
                }),
              },
            },
          ],
        })
      }
      return Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sessions: [
                  { weekLabel: null, dayLabel: null, title: 'Full Body', blocks: [] },
                ],
                warnings: ['Day had no explicit block labels; grouped as one block'],
              }),
            },
          },
        ],
      })
    })

    const result = await parseProgramBrief('a loosely structured single-day plan')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')
    expect(result.data.warnings).toEqual([
      '"programTitle" was not explicitly stated in the document and was inferred.',
      '"difficultyLevel" was not explicitly stated in the document and was inferred.',
      'Day had no explicit block labels; grouped as one block',
    ])
  })

  it('returns an error result when the document is empty', async () => {
    const result = await parseProgramBrief('   ')
    expect(result.ok).toBe(false)
  })

  it('returns an error result when zero sessions can be extracted', async () => {
    mockCreate.mockImplementation((args: any) => {
      if (args.response_format.json_schema.name === 'brief_metadata') {
        return Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  programTitle: 'Empty',
                  focusAreas: [],
                  difficultyLevel: 'BEGINNER',
                  durationMinutes: 30,
                  preferredWeekdays: ['Monday'],
                  inferredFields: [],
                }),
              },
            },
          ],
        })
      }
      return Promise.resolve({ choices: [{ message: { content: JSON.stringify({ sessions: [], warnings: [] }) } }] })
    })

    const result = await parseProgramBrief('completely unrelated content with no sessions')
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/__tests__/program-brief.service.test.ts`
Expected: FAIL — the exported `parseProgramBrief` still has the old strict-header signature/behavior (sync, header-based), so these tests fail with either a type error or wrong results.

- [ ] **Step 3: Delete the old pipeline and write the new orchestrator**

In `lib/services/program-brief.service.ts`, delete these functions/constants entirely (they are no longer called by anything once this step is done): `parseHeaderSections`, `parseCircuits`, `normalizeWeekday`, `normalizeName`, `splitCommaList`, `validate`, `normalizeInferred`, `isSessionTitleLine`, `isKnownBlockHeader`, `BLOCK_HEADER_PATTERNS`, `blockNameFromHeader`, `isSeparatorLine`, `looksLikeExercise`, `parseExerciseFromLine`, `extractSessionBlueprint`, `inferDaysFromText`, `inferProgramTitle`, `inferDifficulty`, `inferFocusAreasFromText`, `inferDurationMinutes`, `inferCircuitFocusType`, the old `parseProgramBrief` function, and the old `parseProgramBriefFlexible` function. Also delete the constants `REQUIRED_HEADERS`, `OPTIONAL_HEADERS`, `ALL_HEADERS`, the `HeaderKey` type, and `WEEKDAY_FALLBACK_ORDER` (identical contents to `WEEKDAYS` — keep only `WEEKDAYS`).

Also update `ProgramBriefParsed`. Find:

```ts
export type ProgramBriefParsed = {
  programTitle: string;
  focusAreas: string[];
  difficultyLevel: string;
  durationMinutes: number;
  daysPerWeek: number;
  preferredWeekdays: string[];
  circuits: CircuitConfig[];
  preferredExerciseNames?: string[];
  sessionBlueprint?: SessionBlueprint[];
  subjective?: string;
  trainerPrompt?: string;
  additionalNotes?: string;
};
```

Replace with:

```ts
export type ProgramBriefParsed = {
  programTitle: string;
  focusAreas: string[];
  difficultyLevel: string;
  durationMinutes: number;
  daysPerWeek: number;
  preferredWeekdays: string[];
  circuits: CircuitConfig[];
  sessionBlueprint?: SessionBlueprint[];
  warnings?: string[];
};
```

Then add the new orchestrator at the end of the file, after `extractChunkSessions`:

```ts
const MAX_CONCURRENT_CHUNKS = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function sessionSummary(s: RawSession): string {
  return `${s.weekLabel ?? 'no week label'}, ${s.dayLabel ?? s.title}`;
}

export async function parseProgramBrief(text: string): Promise<ProgramBriefParseResult> {
  if (!text.trim()) {
    return { ok: false, errors: ['The document appears to be empty or unreadable.'] };
  }

  const metadata = await extractBriefMetadata(text);
  const chunks = splitIntoChunks(text);

  if (!chunks.length) {
    return { ok: false, errors: ['No content could be extracted from this document.'] };
  }

  // Cost-visibility signal only — no cap on chunk count per the "no size limit" requirement.
  if (chunks.length > 40) {
    console.warn(`[program-brief] Unusually large document: ${chunks.length} chunks to process.`);
  }

  // Best-effort continuity hint for chunk N+1 — chunks run concurrently, so this
  // may occasionally reflect a different chunk's completion order than strict
  // document order. That's acceptable: correctness comes from mergeChunkSessions'
  // weekLabel-based grouping, not from this hint.
  let lastSessionNote: string | null = null;
  const chunkResults = await mapWithConcurrency(chunks, MAX_CONCURRENT_CHUNKS, async (chunk, index) => {
    const continuityNote = lastSessionNote
      ? `The previous chunk's last session was: ${lastSessionNote}.`
      : null;
    try {
      const result = await extractChunkSessions(chunk, index, chunks.length, continuityNote);
      if (result.sessions.length) {
        lastSessionNote = sessionSummary(result.sessions[result.sessions.length - 1]);
      }
      return result;
    } catch {
      try {
        return await extractChunkSessions(chunk, index, chunks.length, continuityNote);
      } catch {
        return {
          sessions: [],
          warnings: [
            `Couldn't parse part of the document (section ${index + 1} of ${chunks.length}) — please review that section manually.`,
          ],
        };
      }
    }
  });

  const { sessionBlueprint, daysPerWeek, warnings: chunkWarnings } = mergeChunkSessions(chunkResults);

  if (!sessionBlueprint.length) {
    return { ok: false, errors: ['No training sessions could be found in this document.'] };
  }

  const circuits = deriveCircuitsFromSessions(sessionBlueprint);

  let preferredWeekdays = metadata.preferredWeekdays.length
    ? [...metadata.preferredWeekdays]
    : WEEKDAYS.slice(0, daysPerWeek);

  if (preferredWeekdays.length !== daysPerWeek) {
    if (preferredWeekdays.length > daysPerWeek) {
      preferredWeekdays = preferredWeekdays.slice(0, daysPerWeek);
    } else {
      const existing = new Set(preferredWeekdays);
      for (const day of WEEKDAYS) {
        if (preferredWeekdays.length >= daysPerWeek) break;
        if (!existing.has(day)) preferredWeekdays.push(day);
      }
    }
  }

  const inferredFieldWarnings = metadata.inferredFields.map(
    (field) => `"${field}" was not explicitly stated in the document and was inferred.`
  );

  return {
    ok: true,
    data: {
      programTitle: metadata.programTitle || sessionBlueprint[0].title,
      focusAreas: metadata.focusAreas,
      difficultyLevel: metadata.difficultyLevel,
      durationMinutes: metadata.durationMinutes,
      daysPerWeek,
      preferredWeekdays,
      circuits,
      sessionBlueprint,
      warnings: [...inferredFieldWarnings, ...chunkWarnings],
    },
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run lib/services/__tests__/program-brief.service.test.ts`
Expected: PASS — every test in the file passes, including the 4 new `parseProgramBrief` tests.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "program-brief|program-actions"`
Expected: errors only in `actions/program-actions.ts` (it still calls the now-deleted `parseProgramBriefFlexible` and references `brief.preferredExerciseNames`/`brief.subjective`/`brief.trainerPrompt`/`brief.additionalNotes`) — these get fixed in Task 7. No errors inside `program-brief.service.ts` itself.

- [ ] **Step 5: Commit**

```bash
git add lib/services/program-brief.service.ts lib/services/__tests__/program-brief.service.test.ts
git commit -m "feat(program-brief): replace regex-based parsing with AI-driven pipeline

Deletes parseProgramBrief (strict header parser), extractSessionBlueprint and
its full regex apparatus, and all metadata-guessing regexes. Every document
now goes through the same path: AI metadata extraction, local chunking,
per-chunk AI session extraction, and week-label-based merging."
```

---

### Task 7: Wire the new orchestrator into `actions/program-actions.ts`

**Files:**
- Modify: `actions/program-actions.ts`

**Interfaces:**
- Consumes: `parseProgramBrief` (Task 6, now async and the sole export replacing `parseProgramBriefFlexible`), `GeneratedProgram.warnings` (Task 3).
- Produces: `generateProgramPreviewFromBriefAction`'s success response gains a `warnings: string[]` field, consumed by Task 8's UI.

- [ ] **Step 1: Update the import and call site**

In `actions/program-actions.ts`, find:

```ts
import {
  extractProgramBriefText,
  parseProgramBriefFlexible,
} from "@/lib/services/program-brief.service";
```

(Confirm the exact existing import line by running `grep -n "program-brief.service" actions/program-actions.ts` first — it may be combined with other imports; update whichever names are imported from that module, replacing `parseProgramBriefFlexible` with `parseProgramBrief`.)

Then find, inside `generateProgramPreviewFromBriefAction`:

```ts
    const rawText = await extractProgramBriefText(input.fileUrl, input.fileName);
    const parsed = await parseProgramBriefFlexible(rawText);
    if (!parsed.ok) {
      return { success: false as const, error: parsed.errors.join("\n") };
    }

    const brief = parsed.data;

    const params = {
      programTitle: brief.programTitle,
      focusAreas: brief.focusAreas,
      durationMinutes: brief.durationMinutes,
      daysPerWeek: brief.daysPerWeek,
      circuits: brief.circuits.map((c) => ({
        name: c.name,
        focusType: c.focusType,
        exerciseCount: c.exerciseCount,
        rounds: c.rounds,
      })),
      difficultyLevel: brief.difficultyLevel,
      preferredWeekdays: brief.preferredWeekdays,
      additionalNotes: brief.additionalNotes,
      subjective: brief.subjective,
      trainerPrompt: brief.trainerPrompt,
      preferredExerciseNames: brief.preferredExerciseNames,
      sessionBlueprint: brief.sessionBlueprint,
    };

    const aiPlan = await generateProgram(params);

    return {
      success: true as const,
      data: {
        aiPlan,
        params,
        parsed: brief,
      },
    };
```

Replace with:

```ts
    const rawText = await extractProgramBriefText(input.fileUrl, input.fileName);
    const parsed = await parseProgramBrief(rawText);
    if (!parsed.ok) {
      return { success: false as const, error: parsed.errors.join("\n") };
    }

    const brief = parsed.data;

    const params = {
      programTitle: brief.programTitle,
      focusAreas: brief.focusAreas,
      durationMinutes: brief.durationMinutes,
      daysPerWeek: brief.daysPerWeek,
      circuits: brief.circuits.map((c) => ({
        name: c.name,
        focusType: c.focusType,
        exerciseCount: c.exerciseCount,
        rounds: c.rounds,
      })),
      difficultyLevel: brief.difficultyLevel,
      preferredWeekdays: brief.preferredWeekdays,
      sessionBlueprint: brief.sessionBlueprint,
    };

    const aiPlan = await generateProgram(params);

    return {
      success: true as const,
      data: {
        aiPlan,
        params,
        parsed: brief,
        warnings: [...(brief.warnings ?? []), ...(aiPlan.warnings ?? [])],
      },
    };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "program-brief|program-actions|ai.service"`
Expected: no output — no type errors remaining in any of the three files touched by this plan so far.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every existing test suite in the repo still passes (this confirms Task 7's edits didn't break any other action that imports from `program-actions.ts`), plus all tests added in Tasks 1–6.

- [ ] **Step 4: Commit**

```bash
git add actions/program-actions.ts
git commit -m "feat(program-actions): use AI-driven brief parsing and surface warnings"
```

---

### Task 8: Warnings panel in the brief-upload preview UI

**Files:**
- Modify: `components/programs/program-brief-upload.tsx`

**Interfaces:**
- Consumes: `warnings: string[]` on `generateProgramPreviewFromBriefAction`'s response `data` (Task 7).

- [ ] **Step 1: Extend `PreviewState` and store the warnings**

Find:

```ts
type PreviewState = {
  aiPlan: {
    name: string;
    description?: string;
    workouts: {
      name: string;
      dayIndex: number;
      weekIndex: number;
      blocks: {
        name?: string;
        type: string;
        orderIndex: number;
        exercises: {
          exerciseId: string;
          exerciseName?: string;
          orderIndex: number;
          sets: number;
          reps: string;
        }[];
      }[];
    }[];
  };
  params: Record<string, unknown>;
  parsed: {
    programTitle: string;
    focusAreas: string[];
    difficultyLevel: string;
    durationMinutes: number;
    daysPerWeek: number;
    preferredWeekdays: string[];
    circuits: { name: string; focusType: string; exerciseCount: number }[];
    subjective?: string;
    trainerPrompt?: string;
    additionalNotes?: string;
  };
};
```

Replace with:

```ts
type PreviewState = {
  aiPlan: {
    name: string;
    description?: string;
    workouts: {
      name: string;
      dayIndex: number;
      weekIndex: number;
      blocks: {
        name?: string;
        type: string;
        orderIndex: number;
        exercises: {
          exerciseId: string;
          exerciseName?: string;
          orderIndex: number;
          sets: number;
          reps: string;
        }[];
      }[];
    }[];
  };
  params: Record<string, unknown>;
  parsed: {
    programTitle: string;
    focusAreas: string[];
    difficultyLevel: string;
    durationMinutes: number;
    daysPerWeek: number;
    preferredWeekdays: string[];
    circuits: { name: string; focusType: string; exerciseCount: number }[];
  };
  warnings: string[];
};
```

- [ ] **Step 2: Add the `AlertTriangle` icon import**

Find:

```ts
import {
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
```

Replace with:

```ts
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
```

- [ ] **Step 3: Render the warnings panel**

Find the start of the preview card's content, right after the `<CardTitle>`:

```tsx
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
```

Replace with:

```tsx
          <CardContent className="space-y-6">
            {preview.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Review before saving
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {preview.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
```

- [ ] **Step 4: Verify manually**

This is a UI change without an existing component test harness for this file — verify by running the dev server and exercising the upload flow (covered by Task 9's end-to-end verification, which uses a document guaranteed to produce at least one warning so the panel is visible).

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep program-brief-upload`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add components/programs/program-brief-upload.tsx
git commit -m "feat(program-brief-upload): show inferred-field and exercise-match warnings before saving"
```

---

### Task 9: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated test suite one more time**

Run: `npx vitest run`
Expected: PASS — every test in the repo passes.

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean typecheck across the whole project).

- [ ] **Step 2: Manually verify against the real baseball 4-week document**

Start the dev server (`npm run dev`), sign in as a trainer, go to the program-brief upload screen, and upload `~/Downloads/Baseball_Offseason_4_Week_4_Day_Template.docx` (the document used to diagnose the original "only 1 week" bug). Confirm:
- The preview shows 4 weeks × 4 days (16 sessions total), matching the document.
- Exercise names match the document (Dynamic Mobility, Pogo Hops, Primary Lift, etc.) with no leading dashes or "Rest:"/"Strength Block A:" pollution.
- Any warnings shown are specific and actionable (e.g. a fuzzy-match note), not generic.

- [ ] **Step 3: Manually verify against documents with different structures**

Using the same upload screen, test at least these three synthetic variations (write them as quick `.txt` or `.docx` files):
- A single-week, 3-day template with no "Week" headers at all — confirm it produces exactly 1 week, not more.
- A document using entirely different terminology (no "circuits"/"blocks" vocabulary — plain prose like "Start with a warm-up, then do 3 sets of squats, then 3 sets of lunges") — confirm sessions and exercises still extract correctly.
- A document that names an exercise not in the exercise library (e.g. an invented name like "Zorbatron Press") — confirm the preview shows a "no matching exercise" warning rather than crashing or silently omitting it without explanation.

- [ ] **Step 4: Report results**

Summarize what was verified and any issues found. If an issue is found, treat it as a bug against the relevant task above (fix in that task's file, re-run that task's tests, then re-verify here) rather than patching ad hoc.
