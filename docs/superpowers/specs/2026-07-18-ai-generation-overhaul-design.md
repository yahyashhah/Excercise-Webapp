# AI Program Generation Overhaul — Design

**Date:** 2026-07-18
**Status:** Approved in brainstorming; pending final spec review
**Sub-project:** 1 of 4 in the production-readiness sequence (AI generation → program editor/calendar → patient experience → foundation sweep)

## 1. Context & Goals

The app's core claim is "AI builds a clinical-grade exercise program." Today the AI layer is the shakiest part of the product:

- 3 different models across 2 providers, hardcoded in 7+ call sites.
- **`claude-3-haiku-20240307` was retired by Anthropic on 2026-04-19.** Dashboard insights (which swallows errors and returns `[]`) has been silently dead since then; the patient self-serve builder errors on that model too.
- The main generator (`lib/services/ai.service.ts` — `generateWorkoutPlan`) validates LLM output with raw `JSON.parse` + ad-hoc ID filtering that can **silently drop entire weeks**.
- Only 1 of 6 AI flows streams; the heaviest one blocks for up to 60s with no progress.
- Prompts are inline template strings with no versioning; no way to know if a prompt change made programs better or worse.

**Goals:**

1. Programs are genuinely clinical-grade for **both regimes**: rehab (physio prescribing for injuries/conditions) and performance (trainer strength & conditioning), with a hybrid staged mode.
2. Generation is reliable: schema-validated everywhere, repair instead of silent drops, visible errors.
3. Generation feels professional: streaming live preview, cancel support, honest progress.
4. Quality is measurable: an eval suite gates prompt/model changes.

**Non-goals (explicitly out of scope):**

- Patient self-serve builder redesign (gets a one-line model-registry swap only — required, since its model is retired).
- Exercise metadata generation (works; registry lookup only).
- Exercise pool building/scoring, calendar mapping, persistence (`buildExercisePoolForWeek`, `mapFocusAreasToBodyRegions`, similarity scoring — all unchanged).
- Any non-AI area of the app (editor UX, patient experience, billing — later sub-projects).

**Guiding constraint from the product owner:** preserve everything that already works; modify only what is genuinely broken or below bar. This is a targeted upgrade of the LLM-call layer, not a rewrite.

## 2. Approach (chosen: consolidate onto AI SDK + central model registry)

Considered:

- **A — minimal hardening in place** (keep raw `openai` client, hand-roll validation/SSE): least churn but permanently keeps the two-SDK split and re-implements what AI SDK v6 already provides.
- **B — consolidate onto Vercel AI SDK v6 with a central model registry** ← **chosen**. Matches the pattern 3 of 6 flows already use; bounded refactor of only the broken layer.
- **C — agentic multi-step generation**: 3–5× cost/latency, harder to debug; not justified for pilots.

## 3. Architecture

### 3.1 Model registry — `lib/ai/models.ts`

A single typed map from **role** to model, consumed by every AI flow:

| Role | Purpose | Default model | Notes |
|---|---|---|---|
| `generation` | Multi-week program generation | Benchmarked: `claude-sonnet-5` vs. current `gpt-4o` (and optionally a GPT-5-class model) via the eval suite; winner becomes default | Sonnet 5 is the strong candidate: near-Opus coding/agentic quality at $3/$15 per MTok (intro $2/$10 through 2026-08-31) |
| `extraction` | Doc-upload parsing (`program-brief.service`) | `gpt-4o` (current behavior preserved) | |
| `insights` | Dashboard coaching insights | `claude-haiku-4-5` | Replaces retired Haiku 3; $1/$5 per MTok |
| `utility` | Small tasks (exercise-name fuzzy matching, patient builder) | `claude-haiku-4-5` | Replaces a full GPT-4o call for name matching (~20× cheaper) and the retired model in the patient builder |
| `judge` | Eval-suite LLM judge (dev-only, never in the request path) | `claude-opus-4-8` | Highest-quality grading; cost acceptable since evals run manually |

- Each role env-overridable: `AI_MODEL_GENERATION`, `AI_MODEL_EXTRACTION`, `AI_MODEL_INSIGHTS`, `AI_MODEL_UTILITY`.
- Exposes `getModel(role)` returning an AI SDK `LanguageModel` instance (via `@ai-sdk/anthropic` / `@ai-sdk/openai`, both already installed).
- All 6 AI flows read from the registry. No hardcoded model strings remain anywhere (`grep` for model IDs must return only `lib/ai/models.ts`).

### 3.2 Generation pipeline (replaces the LLM-call core of `generateWorkoutPlan`)

```
clinician input
  → build exercise pools per week          (existing code, unchanged)
  → for each week, sequentially:
      streamObject(weekSchema)             (streams partial objects to UI)
      → validate week                      (Zod structural + semantic checks)
      → repair pass (once, targeted)       (re-ask only for invalid items)
  → map to calendar & persist              (existing code, unchanged)
```

Key decisions:

- **Weeks generate sequentially, not in parallel.** Each week's prompt includes the exercises already used, replacing today's "pools built in parallel, dedup by prompt instruction + post-hoc filtering" (the acknowledged weak spot at `ai.service.ts:399-401`).
- **Route handler** (`app/api/ai/generate-workout-plan/route.ts` or equivalent): streams week chunks over the AI SDK data stream protocol. The existing patient-builder route (`app/api/ai/generate-program/route.ts`) is the in-repo precedent for `streamObject`.
- **Cancel:** client abort propagates; completed weeks are kept in the draft.

### 3.3 Regime-aware prompt system — `lib/ai/prompts/`

- `regime: 'rehab' | 'performance' | 'hybrid'` added to generation params.
- **Inference:** diagnosis / pain score / time-since-injury present → `rehab`; none of those + fitness goals → `performance`; both signals → `hybrid`. Shown as an editable select in the generate form — clinician always has final say.
- One prompt builder per regime plus a **shared safety core** (existing rules preserved: never violate contraindications, only library exercise IDs, equipment constraints, warm-up/cool-down):
  - `rehab.ts` — contraindication-first framing, pain-monitoring guidance (acceptable discomfort ≤3/10), tissue-healing-stage awareness, conservative dosage, per-exercise regression alternative.
  - `performance.ts` — week-over-week periodization (volume/intensity waves), progressive overload, movement-pattern balance (push/pull/hinge/squat/carry), rep ranges matched to goal (strength/hypertrophy/endurance).
  - `hybrid.ts` — staged: early weeks rehab rules → later weeks performance, with explicit advancement criteria.
- Each file exports a `PROMPT_VERSION` constant; eval results are recorded against `(promptVersion, model)`.

### 3.4 Validation → repair

Per generated week:

1. **Structural (Zod, during streaming):** week/session/block/exercise shape, required fields.
2. **Semantic (post-stream):**
   - Every exercise ID ∈ that week's pool.
   - Sets/reps/rest within regime-specific bounds (e.g. rehab: ≤4 sets, rest ≥30s; performance: goal-appropriate rep ranges).
   - No duplicate exercise across weeks (global set).
   - Warm-up and cool-down present per session.
3. **Repair (max 1 round per week):** violations are collected and a single follow-up `generateObject` call re-asks **only for the invalid slots**, with the specific reason ("exercise `x123` not in the allowed list; choose a substitute targeting the same region for the same slot"). Repaired items re-validate.
4. **Honest failure:** if repair fails, the draft shows a clearly-marked unfilled slot ("couldn't fill: hamstring slot, week 3") the clinician fills manually. **Nothing is silently dropped** — this replaces the current behavior at `ai.service.ts:527`.

### 3.5 Streaming UX (generate page)

- On submit, the program skeleton renders immediately (weeks × selected days).
- Sessions fill in as partial objects stream; per-week status chip: `generating → validating → repaired/ready` (repair shown honestly, not hidden).
- Cancel button aborts generation, keeps completed weeks.
- Failures show a typed, human-readable error with a retry affordance — no toast-and-nothing.

### 3.6 Supporting flows

**Doc extraction (`program-brief.service.ts`)** — minimal changes:
- Model from registry (`extraction`).
- Manual `Math.min/max` clamps expressed in the Zod/JSON schema instead.
- Extraction failure surfaces a user-readable message, not a generic 500.

**Dashboard insights (`dashboard-ai-insights.service.ts`)**:
- Model from registry (`insights`) — **fixes the currently-dead feature** (retired model).
- Cached per clinician, regenerated at most hourly (Next.js `unstable_cache` or equivalent with a time-based key).
- Errors render an "insights unavailable" card state; empty `[]` means genuinely no insights, never a swallowed error.

**Patient builder + exercise metadata:** registry lookups only (the patient builder's model swap is required — its model is retired).

### 3.7 Error handling

- `AIGenerationError` with `kind: 'rate_limit' | 'timeout' | 'validation_exhausted' | 'provider_down' | 'aborted'`.
- Route handlers map kinds to user-facing messages and retryability.
- No `catch { return [] }` or bare generic 500s in AI paths.

## 4. Eval suite — `lib/ai/evals/`

- **~20 fixture profiles** (JSON/TS fixtures) spanning both regimes and risky edges: post-op ACL at 6 weeks, chronic low-back pain with pain 7/10, elderly deconditioned + balance deficit, healthy athlete strength block, shoulder impingement + limited equipment, hybrid return-to-sport, plus adversarial cases (contraindication conflicting with stated goal; equipment list contradicting exercise needs).
- **Rubric** (written, versioned in the repo) with:
  - **Hard safety gates (auto-fail):** any contraindicated exercise; any non-library exercise ID; difficulty exceeding profile level.
  - **Graded dimensions (1–5, LLM judge):** progression logic across weeks, movement/region balance, dosage sanity for the regime, schedule fit, rationale quality.
- **Runner:** `npm run eval` — generates a program per fixture with the current `(prompt, model)`, scores with an LLM judge (the registry's `judge` role), writes a scored markdown/JSON report to `lib/ai/evals/reports/`.
- **Not in CI** (real token cost); run manually before merging prompt/model changes.
- **First use:** benchmark `generation` candidates (current `gpt-4o` vs `claude-sonnet-5`, optionally a GPT-5-class model) and pick the default on evidence.

## 5. Testing

- **Unit (Vitest, existing patterns):** validators (ID membership, dosage bounds, cross-week dedup), repair-prompt construction, regime inference, registry resolution + env overrides, error mapping. No live API calls.
- **Existing `ai.service.test.ts`:** kept green; updated where behavior intentionally changed (silent-drop → repair/visible-gap).
- **Eval suite** covers the nondeterministic quality dimension (section 4).
- Manual end-to-end check of the generate flow (streaming, cancel, repair path) before sign-off.

## 6. Rollout / migration

- The new pipeline replaces the internals of `generateWorkoutPlan`'s clinical path; its public signature and callers stay compatible (or receive a thin adapter).
- `generateProgram` / `generateClinicalPlan` migrate onto the same core.
- Registry lands first (smallest, unblocks the dead-model fixes immediately); then validation/repair; then streaming; then prompts/regimes; then evals. Each step ships independently.

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Sequential week generation slower than parallel | Streaming makes perceived latency far lower than today's 60s blind wait; weeks are individually fast |
| New model regresses program quality | Eval suite is the gate; registry env-override allows instant model rollback without deploy |
| Repair loop adds cost | Max 1 repair round per week, scoped to invalid items only |
| LLM judge scores drift | Judge prompt + rubric versioned; fixtures stable; scores compared relatively (before/after), not absolutely |
