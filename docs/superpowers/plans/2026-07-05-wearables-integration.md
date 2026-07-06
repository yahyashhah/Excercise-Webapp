# Wearables Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let clients connect a wearable (Apple Watch, Fitbit, Garmin, Oura, Whoop) via Junction (formerly Vital), ingest sleep/HR/HRV/activity/workout data through a webhook, run basic clinical alert rules, and surface the data to both clients and trainers.

**Architecture:** Junction is the sole external integration surface — it owns device SDKs/OAuth and hands us one normalized webhook schema. Our backend issues Junction link tokens, verifies and ingests webhooks into three new Prisma models, runs alert rules synchronously on ingest, and exposes the data through existing UI surfaces (settings page, client dashboard, trainer progress page).

**Tech Stack:** Next.js App Router (server actions + route handlers), Prisma/MongoDB, `svix` (already a dependency, used by the Clerk webhook), `@junction-api/sdk` (new), `@tryvital/vital-link` (new, frontend widget), Vitest, Recharts.

## Global Constraints

- Follow the existing `patientId`-mapped-as-`clientId` DB field convention used by `BodyMetric`, `ProgressPhoto`, etc. (spec: Data model section).
- Server actions return `{ success: true, data }` or `{ success: false, error }`, matching `actions/progress-actions.ts` (spec: implied by codebase conventions).
- Alert rules require ≥5 days of prior data before firing, and dedupe to at most one open alert per `(clientId, metric)` per 24 hours (spec: Alerting section).
- Workout data is displayed only, not alerted on, in v1 (spec: Alerting section).
- No historical backfill logic needed in our code — Junction schedules this automatically on connection; our webhook handlers must be idempotent to absorb the resulting burst (spec: Error handling section).
- New env vars required (add to `.env.local`, which is gitignored): `VITAL_API_KEY`, `VITAL_ENV` (`sandbox` or `production`, server-side), `NEXT_PUBLIC_VITAL_ENV` (same value, client-side — read by the Junction Link widget in `wearable-connection-card.tsx`), `VITAL_WEBHOOK_SECRET`.

## Design refinement made during planning

The spec's `WearableConnection` model had `vitalUserId String @unique`, which breaks once a client connects a second provider (one Junction user can have multiple provider connections, all sharing the same Junction `user_id`). This plan splits that into:
- **`WearableAccount`**: the 1:1 `clientId` ↔ Junction `user_id` mapping, created once per client, used only to request link tokens.
- **`WearableConnection`**: per-provider connection status, uniqued on `[clientId, provider]` instead of `vitalUserId`.

This also turned out to be unnecessary for webhook correlation — real Junction webhook payloads include `client_user_id` directly (confirmed against their docs), which we set to our own `clientId` when creating the Junction user. So webhook handlers key off `client_user_id` directly and never need to look up `WearableAccount`.

---

### Task 1: Prisma schema — wearables data model

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `WearableProvider` enum (`APPLE_HEALTH`, `FITBIT`, `GARMIN`, `OURA`, `WHOOP`, `OTHER`), `WearableConnectionStatus` enum (`CONNECTED`, `DISCONNECTED`, `ERROR`), and models `WearableAccount`, `WearableConnection`, `WearableDailySummary`, `WearableWorkout`, all consumed by Tasks 3-9.

- [ ] **Step 1: Add the enums and models to `prisma/schema.prisma`**

Add after the existing `enum ExerciseSource { ... }` block (around line 103):

```prisma
enum WearableProvider {
  APPLE_HEALTH
  FITBIT
  GARMIN
  OURA
  WHOOP
  OTHER
}

enum WearableConnectionStatus {
  CONNECTED
  DISCONNECTED
  ERROR
}
```

Add at the end of the file (after `model TrainerSubscription`):

```prisma
model WearableAccount {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  clientId    String   @unique @map("patientId") @db.ObjectId
  client      User     @relation("WearableAccount", fields: [clientId], references: [id])
  vitalUserId String   @unique
  createdAt   DateTime @default(now())
}

model WearableConnection {
  id             String                   @id @default(auto()) @map("_id") @db.ObjectId
  clientId       String                   @map("patientId") @db.ObjectId
  client         User                     @relation("WearableConnections", fields: [clientId], references: [id])
  provider       WearableProvider
  status         WearableConnectionStatus @default(CONNECTED)
  connectedAt    DateTime                 @default(now())
  lastSyncedAt   DateTime?
  disconnectedAt DateTime?

  @@unique([clientId, provider])
  @@index([clientId])
}

model WearableDailySummary {
  id               String           @id @default(auto()) @map("_id") @db.ObjectId
  clientId         String           @map("patientId") @db.ObjectId
  client           User             @relation("WearableDailySummaries", fields: [clientId], references: [id])
  date             DateTime
  provider         WearableProvider
  sleepDurationMin Int?
  sleepScore       Int?
  restingHeartRate Int?
  hrvMs            Float?
  steps            Int?
  activeMinutes    Int?
  caloriesBurned   Int?
  raw              Json?
  createdAt        DateTime         @default(now())

  @@unique([clientId, date, provider])
  @@index([clientId, date])
}

model WearableWorkout {
  id              String           @id @default(auto()) @map("_id") @db.ObjectId
  clientId        String           @map("patientId") @db.ObjectId
  client          User             @relation("WearableWorkouts", fields: [clientId], references: [id])
  provider        WearableProvider
  externalId      String
  activityType    String
  startedAt       DateTime
  endedAt         DateTime
  durationMinutes Int
  avgHeartRate    Int?
  caloriesBurned  Int?
  raw             Json?
  createdAt       DateTime         @default(now())

  @@unique([provider, externalId])
  @@index([clientId, startedAt])
}
```

- [ ] **Step 2: Add the back-relations to `model User`**

In `prisma/schema.prisma`, inside `model User { ... }`, add after the existing `trainerSubscription` line:

```prisma
  wearableAccount        WearableAccount?
  wearableConnections    WearableConnection[]   @relation("WearableConnections")
  wearableDailySummaries WearableDailySummary[] @relation("WearableDailySummaries")
  wearableWorkouts       WearableWorkout[]      @relation("WearableWorkouts")
```

- [ ] **Step 3: Validate and generate the Prisma client**

Run: `npx prisma format && npx prisma validate && npx prisma generate`
Expected: all three commands exit 0; `prisma generate` prints `Generated Prisma Client`.

- [ ] **Step 4: Push the schema to the dev database**

Run: `npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(wearables): add wearable connection and data models"
```

---

### Task 2: Junction SDK client wrapper

**Files:**
- Create: `lib/vital.ts`
- Test: `lib/__tests__/vital.test.ts`

**Interfaces:**
- Consumes: `WearableProvider` enum from `@prisma/client` (Task 1, for the provider-slug mapping used later in Task 6).
- Produces: `getOrCreateVitalUserId(clientId: string): Promise<string>`, `createLinkToken(vitalUserId: string): Promise<string>`, `mapJunctionSlugToProvider(slug: string): WearableProvider` — all consumed by Task 3 (`wearable.service.ts`), Task 5 (`wearable-actions.ts`), and Task 6 (webhook route).

- [ ] **Step 1: Install the SDK packages**

Run: `npm install @junction-api/sdk @tryvital/vital-link`
Expected: both added to `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `lib/__tests__/vital.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUserCreate = vi.fn();
const mockLinkToken = vi.fn();

vi.mock("@junction-api/sdk", () => ({
  JunctionClient: vi.fn().mockImplementation(() => ({
    user: { create: mockUserCreate },
    link: { token: mockLinkToken },
  })),
  JunctionEnvironment: { Sandbox: "sandbox", Production: "production" },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wearableAccount: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  getOrCreateVitalUserId,
  createLinkToken,
  mapJunctionSlugToProvider,
} from "@/lib/vital";

const mockAccountFind = vi.mocked(prisma.wearableAccount.findUnique);
const mockAccountCreate = vi.mocked(prisma.wearableAccount.create);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOrCreateVitalUserId", () => {
  it("returns the cached vitalUserId if a WearableAccount already exists", async () => {
    mockAccountFind.mockResolvedValue({
      id: "acct_1",
      clientId: "client_1",
      vitalUserId: "vital_user_1",
      createdAt: new Date(),
    });

    const result = await getOrCreateVitalUserId("client_1");

    expect(result).toBe("vital_user_1");
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("creates a Junction user and WearableAccount when none exists", async () => {
    mockAccountFind.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ user_id: "vital_user_2" });
    mockAccountCreate.mockResolvedValue({
      id: "acct_2",
      clientId: "client_2",
      vitalUserId: "vital_user_2",
      createdAt: new Date(),
    });

    const result = await getOrCreateVitalUserId("client_2");

    expect(mockUserCreate).toHaveBeenCalledWith({ client_user_id: "client_2" });
    expect(mockAccountCreate).toHaveBeenCalledWith({
      data: { clientId: "client_2", vitalUserId: "vital_user_2" },
    });
    expect(result).toBe("vital_user_2");
  });
});

describe("createLinkToken", () => {
  it("returns the link token for a given vitalUserId", async () => {
    mockLinkToken.mockResolvedValue({ link_token: "token_abc" });

    const result = await createLinkToken("vital_user_1");

    expect(mockLinkToken).toHaveBeenCalledWith({ userId: "vital_user_1" });
    expect(result).toBe("token_abc");
  });
});

describe("mapJunctionSlugToProvider", () => {
  it("maps known slugs to the WearableProvider enum", () => {
    expect(mapJunctionSlugToProvider("apple_health_kit")).toBe("APPLE_HEALTH");
    expect(mapJunctionSlugToProvider("fitbit")).toBe("FITBIT");
    expect(mapJunctionSlugToProvider("garmin")).toBe("GARMIN");
    expect(mapJunctionSlugToProvider("oura")).toBe("OURA");
    expect(mapJunctionSlugToProvider("whoop_v2")).toBe("WHOOP");
  });

  it("falls back to OTHER for unrecognized slugs", () => {
    expect(mapJunctionSlugToProvider("freestyle_libre_ble")).toBe("OTHER");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/__tests__/vital.test.ts`
Expected: FAIL with `Cannot find module '@/lib/vital'`.

- [ ] **Step 4: Implement `lib/vital.ts`**

```typescript
import { JunctionClient, JunctionEnvironment } from "@junction-api/sdk";
import { prisma } from "@/lib/prisma";
import type { WearableProvider } from "@prisma/client";

let _client: JunctionClient | null = null;

function getClient(): JunctionClient {
  if (!_client) {
    _client = new JunctionClient({
      apiKey: process.env.VITAL_API_KEY!,
      environment:
        process.env.VITAL_ENV === "production"
          ? JunctionEnvironment.Production
          : JunctionEnvironment.Sandbox,
    });
  }
  return _client;
}

/**
 * Returns the Junction user id for a client, creating both the Junction
 * user and the local WearableAccount cache row on first call.
 */
export async function getOrCreateVitalUserId(clientId: string): Promise<string> {
  const existing = await prisma.wearableAccount.findUnique({
    where: { clientId },
  });
  if (existing) return existing.vitalUserId;

  const created = await getClient().user.create({ client_user_id: clientId });
  await prisma.wearableAccount.create({
    data: { clientId, vitalUserId: created.user_id },
  });
  return created.user_id;
}

export async function createLinkToken(vitalUserId: string): Promise<string> {
  const result = await getClient().link.token({ userId: vitalUserId });
  return result.link_token;
}

const SLUG_TO_PROVIDER: Record<string, WearableProvider> = {
  apple_health_kit: "APPLE_HEALTH",
  fitbit: "FITBIT",
  garmin: "GARMIN",
  oura: "OURA",
  whoop_v2: "WHOOP",
  whoop: "WHOOP",
};

export function mapJunctionSlugToProvider(slug: string): WearableProvider {
  return SLUG_TO_PROVIDER[slug] ?? "OTHER";
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/__tests__/vital.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/vital.ts lib/__tests__/vital.test.ts package.json package-lock.json
git commit -m "feat(wearables): add Junction SDK client wrapper"
```

---

### Task 3: Wearable data service layer

**Files:**
- Create: `lib/services/wearable.service.ts`
- Test: `lib/services/__tests__/wearable.service.test.ts`

**Interfaces:**
- Consumes: `prisma` client (Task 1 models), `mapJunctionSlugToProvider` (Task 2, used by callers, not this file).
- Produces: `upsertConnection(clientId, provider, status)`, `upsertDailySummaryFields(clientId, date, provider, fields)`, `upsertWorkout(clientId, provider, externalId, fields)`, `getConnectionsForClient(clientId)`, `getLatestDailySummary(clientId)`, `getDailySummariesForClient(clientId, days)`, `getWorkoutsForClient(clientId)` — all consumed by Task 4 (alerts), Task 6 (webhook route), Task 7-9 (UI data loading).

- [ ] **Step 1: Write the failing test**

Create `lib/services/__tests__/wearable.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wearableConnection: { upsert: vi.fn(), findMany: vi.fn() },
    wearableDailySummary: { upsert: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    wearableWorkout: { upsert: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  upsertConnection,
  upsertDailySummaryFields,
  upsertWorkout,
  getLatestDailySummary,
} from "@/lib/services/wearable.service";

const mockConnectionUpsert = vi.mocked(prisma.wearableConnection.upsert);
const mockSummaryUpsert = vi.mocked(prisma.wearableDailySummary.upsert);
const mockWorkoutUpsert = vi.mocked(prisma.wearableWorkout.upsert);
const mockSummaryFindFirst = vi.mocked(prisma.wearableDailySummary.findFirst);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertConnection", () => {
  it("upserts on the [clientId, provider] composite key", async () => {
    await upsertConnection("client_1", "APPLE_HEALTH", "CONNECTED");

    expect(mockConnectionUpsert).toHaveBeenCalledWith({
      where: { clientId_provider: { clientId: "client_1", provider: "APPLE_HEALTH" } },
      create: { clientId: "client_1", provider: "APPLE_HEALTH", status: "CONNECTED" },
      update: { status: "CONNECTED" },
    });
  });
});

describe("upsertDailySummaryFields", () => {
  it("upserts only the passed fields on the [clientId, date, provider] key", async () => {
    const date = new Date("2026-07-01T00:00:00.000Z");

    await upsertDailySummaryFields("client_1", date, "OURA", {
      sleepDurationMin: 420,
      sleepScore: 85,
    });

    expect(mockSummaryUpsert).toHaveBeenCalledWith({
      where: {
        clientId_date_provider: { clientId: "client_1", date, provider: "OURA" },
      },
      create: {
        clientId: "client_1",
        date,
        provider: "OURA",
        sleepDurationMin: 420,
        sleepScore: 85,
      },
      update: { sleepDurationMin: 420, sleepScore: 85 },
    });
  });
});

describe("upsertWorkout", () => {
  it("upserts on the [provider, externalId] composite key", async () => {
    const startedAt = new Date("2026-07-01T08:00:00.000Z");
    const endedAt = new Date("2026-07-01T08:45:00.000Z");

    await upsertWorkout("client_1", "GARMIN", "ext_1", {
      activityType: "running",
      startedAt,
      endedAt,
      durationMinutes: 45,
    });

    expect(mockWorkoutUpsert).toHaveBeenCalledWith({
      where: { provider_externalId: { provider: "GARMIN", externalId: "ext_1" } },
      create: {
        clientId: "client_1",
        provider: "GARMIN",
        externalId: "ext_1",
        activityType: "running",
        startedAt,
        endedAt,
        durationMinutes: 45,
      },
      update: {
        activityType: "running",
        startedAt,
        endedAt,
        durationMinutes: 45,
      },
    });
  });
});

describe("getLatestDailySummary", () => {
  it("queries the most recent summary for a client ordered by date desc", async () => {
    mockSummaryFindFirst.mockResolvedValue(null);

    await getLatestDailySummary("client_1");

    expect(mockSummaryFindFirst).toHaveBeenCalledWith({
      where: { clientId: "client_1" },
      orderBy: { date: "desc" },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/services/__tests__/wearable.service.test.ts`
Expected: FAIL with `Cannot find module '@/lib/services/wearable.service'`.

- [ ] **Step 3: Implement `lib/services/wearable.service.ts`**

```typescript
import { prisma } from "@/lib/prisma";
import type { WearableProvider, WearableConnectionStatus, Prisma } from "@prisma/client";

// ─── Connections ─────────────────────────────────────────────────────────────

export async function upsertConnection(
  clientId: string,
  provider: WearableProvider,
  status: WearableConnectionStatus
) {
  return prisma.wearableConnection.upsert({
    where: { clientId_provider: { clientId, provider } },
    create: { clientId, provider, status },
    update: { status },
  });
}

export async function getConnectionsForClient(clientId: string) {
  return prisma.wearableConnection.findMany({
    where: { clientId },
    orderBy: { connectedAt: "desc" },
  });
}

// ─── Daily summaries ─────────────────────────────────────────────────────────

export interface WearableDailySummaryFields {
  sleepDurationMin?: number;
  sleepScore?: number;
  restingHeartRate?: number;
  hrvMs?: number;
  steps?: number;
  activeMinutes?: number;
  caloriesBurned?: number;
  raw?: Prisma.InputJsonValue;
}

export async function upsertDailySummaryFields(
  clientId: string,
  date: Date,
  provider: WearableProvider,
  fields: WearableDailySummaryFields
) {
  return prisma.wearableDailySummary.upsert({
    where: { clientId_date_provider: { clientId, date, provider } },
    create: { clientId, date, provider, ...fields },
    update: { ...fields },
  });
}

export async function getLatestDailySummary(clientId: string) {
  return prisma.wearableDailySummary.findFirst({
    where: { clientId },
    orderBy: { date: "desc" },
  });
}

export async function getDailySummariesForClient(clientId: string, days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return prisma.wearableDailySummary.findMany({
    where: { clientId, date: { gte: since } },
    orderBy: { date: "asc" },
  });
}

// ─── Workouts ────────────────────────────────────────────────────────────────

export interface WearableWorkoutFields {
  activityType: string;
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  avgHeartRate?: number;
  caloriesBurned?: number;
  raw?: Prisma.InputJsonValue;
}

export async function upsertWorkout(
  clientId: string,
  provider: WearableProvider,
  externalId: string,
  fields: WearableWorkoutFields
) {
  return prisma.wearableWorkout.upsert({
    where: { provider_externalId: { provider, externalId } },
    create: { clientId, provider, externalId, ...fields },
    update: { ...fields },
  });
}

export async function getWorkoutsForClient(clientId: string, limit = 20) {
  return prisma.wearableWorkout.findMany({
    where: { clientId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/services/__tests__/wearable.service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/services/wearable.service.ts lib/services/__tests__/wearable.service.test.ts
git commit -m "feat(wearables): add wearable data service layer"
```

---

### Task 4: Alert threshold logic

**Files:**
- Create: `lib/services/wearable-alert.service.ts`
- Test: `lib/services/__tests__/wearable-alert.service.test.ts`

**Interfaces:**
- Consumes: `getDailySummariesForClient` (Task 3), `createNotification`, `NOTIFICATION_TYPES` (existing `lib/services/notification.service.ts`), `prisma.user.findMany` (for org-mate trainers), `prisma.notification.findMany` (for dedup — filtered in application code, not via a Prisma JSON `path` filter, since MongoDB JSON-path filter support is not something this plan can assume without live verification).
- Produces: pure functions `checkRestingHeartRateAlert(baselineAvg, todayValue)`, `checkHrvAlert(baselineAvg, todayValue)`, `checkSleepAlert(recentNightsMinutes)`, and orchestrator `evaluateWearableAlerts(clientId)` — consumed by Task 6 (webhook route, called after each summary upsert).

- [ ] **Step 1: Write the failing test**

Create `lib/services/__tests__/wearable-alert.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    notification: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/services/wearable.service", () => ({
  getDailySummariesForClient: vi.fn(),
}));
vi.mock("@/lib/services/notification.service", () => ({
  createNotification: vi.fn(),
  NOTIFICATION_TYPES: { WEARABLE_ALERT: "WEARABLE_ALERT" },
}));

import { prisma } from "@/lib/prisma";
import { getDailySummariesForClient } from "@/lib/services/wearable.service";
import { createNotification } from "@/lib/services/notification.service";
import {
  checkRestingHeartRateAlert,
  checkHrvAlert,
  checkSleepAlert,
  evaluateWearableAlerts,
} from "@/lib/services/wearable-alert.service";

const mockGetSummaries = vi.mocked(getDailySummariesForClient);
const mockCreateNotification = vi.mocked(createNotification);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockUserFindMany = vi.mocked(prisma.user.findMany);
const mockNotificationFindMany = vi.mocked(prisma.notification.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkRestingHeartRateAlert", () => {
  it("fires when today's value exceeds baseline by more than 10%", () => {
    expect(checkRestingHeartRateAlert(60, 67)).toBe(true);
  });
  it("does not fire within 10% of baseline", () => {
    expect(checkRestingHeartRateAlert(60, 65)).toBe(false);
  });
});

describe("checkHrvAlert", () => {
  it("fires when today's value drops more than 15% below baseline", () => {
    expect(checkHrvAlert(50, 40)).toBe(true);
  });
  it("does not fire within 15% of baseline", () => {
    expect(checkHrvAlert(50, 45)).toBe(false);
  });
});

describe("checkSleepAlert", () => {
  it("fires when the last 3 nights are all under 5 hours", () => {
    expect(checkSleepAlert([250, 280, 260])).toBe(true);
  });
  it("does not fire if any of the last 3 nights is 5+ hours", () => {
    expect(checkSleepAlert([250, 310, 260])).toBe(false);
  });
  it("does not fire with fewer than 3 nights of data", () => {
    expect(checkSleepAlert([250, 260])).toBe(false);
  });
});

describe("evaluateWearableAlerts", () => {
  it("does nothing with fewer than 5 days of prior history", async () => {
    mockGetSummaries.mockResolvedValue([
      { date: new Date(), restingHeartRate: 60, hrvMs: 50, sleepDurationMin: 400 },
    ] as never);

    await evaluateWearableAlerts("client_1");

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("creates one WEARABLE_ALERT notification per trainer in the client's org when resting HR spikes", async () => {
    const days = Array.from({ length: 8 }, (_, i) => ({
      date: new Date(Date.now() - (7 - i) * 86_400_000),
      restingHeartRate: i === 7 ? 70 : 60,
      hrvMs: 50,
      sleepDurationMin: 450,
    }));
    mockGetSummaries.mockResolvedValue(days as never);
    mockUserFindUnique.mockResolvedValue({ clerkOrgId: "org_1" } as never);
    mockUserFindMany.mockResolvedValue([
      { id: "trainer_1" },
      { id: "trainer_2" },
    ] as never);
    mockNotificationFindMany.mockResolvedValue([]);

    await evaluateWearableAlerts("client_1");

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "trainer_1", type: "WEARABLE_ALERT" })
    );
  });

  it("does not create a duplicate alert if one already exists in the last 24h", async () => {
    const days = Array.from({ length: 8 }, (_, i) => ({
      date: new Date(Date.now() - (7 - i) * 86_400_000),
      restingHeartRate: i === 7 ? 70 : 60,
      hrvMs: 50,
      sleepDurationMin: 450,
    }));
    mockGetSummaries.mockResolvedValue(days as never);
    mockUserFindUnique.mockResolvedValue({ clerkOrgId: "org_1" } as never);
    mockUserFindMany.mockResolvedValue([{ id: "trainer_1" }] as never);
    mockNotificationFindMany.mockResolvedValue([
      { id: "existing_notif", metadata: { clientId: "client_1", metric: "restingHeartRate" } },
    ] as never);

    await evaluateWearableAlerts("client_1");

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/services/__tests__/wearable-alert.service.test.ts`
Expected: FAIL with `Cannot find module '@/lib/services/wearable-alert.service'`.

- [ ] **Step 3: Implement `lib/services/wearable-alert.service.ts`**

```typescript
import { prisma } from "@/lib/prisma";
import { getDailySummariesForClient } from "@/lib/services/wearable.service";
import { createNotification } from "@/lib/services/notification.service";

const MIN_HISTORY_DAYS = 5;

export function checkRestingHeartRateAlert(baselineAvg: number, todayValue: number): boolean {
  return todayValue > baselineAvg * 1.1;
}

export function checkHrvAlert(baselineAvg: number, todayValue: number): boolean {
  return todayValue < baselineAvg * 0.85;
}

export function checkSleepAlert(recentNightsMinutes: number[]): boolean {
  if (recentNightsMinutes.length < 3) return false;
  const lastThree = recentNightsMinutes.slice(-3);
  return lastThree.every((minutes) => minutes < 300);
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

interface AlertToRaise {
  metric: "restingHeartRate" | "hrv" | "sleep";
  title: string;
  body: string;
  value: number;
  baseline: number;
}

/**
 * Loads a client's trailing wearable data, evaluates the three alert rules,
 * and notifies every trainer in the client's clinic org for any rule that
 * fires (deduped to one open alert per metric per 24h).
 */
export async function evaluateWearableAlerts(clientId: string): Promise<void> {
  const summaries = await getDailySummariesForClient(clientId, MIN_HISTORY_DAYS + 3);
  if (summaries.length < MIN_HISTORY_DAYS + 1) return;

  const sorted = [...summaries].sort((a, b) => a.date.getTime() - b.date.getTime());
  const today = sorted[sorted.length - 1];
  const priorDays = sorted.slice(0, -1);

  const alerts: AlertToRaise[] = [];

  const priorHr = priorDays.map((d) => d.restingHeartRate).filter((v): v is number => v != null);
  if (today.restingHeartRate != null && priorHr.length >= MIN_HISTORY_DAYS) {
    const baseline = average(priorHr);
    if (checkRestingHeartRateAlert(baseline, today.restingHeartRate)) {
      alerts.push({
        metric: "restingHeartRate",
        title: "Resting heart rate elevated",
        body: `Resting HR of ${today.restingHeartRate} bpm is over 10% above the 7-day baseline of ${Math.round(baseline)} bpm.`,
        value: today.restingHeartRate,
        baseline,
      });
    }
  }

  const priorHrv = priorDays.map((d) => d.hrvMs).filter((v): v is number => v != null);
  if (today.hrvMs != null && priorHrv.length >= MIN_HISTORY_DAYS) {
    const baseline = average(priorHrv);
    if (checkHrvAlert(baseline, today.hrvMs)) {
      alerts.push({
        metric: "hrv",
        title: "HRV dropped",
        body: `HRV of ${today.hrvMs}ms is over 15% below the 7-day baseline of ${Math.round(baseline)}ms.`,
        value: today.hrvMs,
        baseline,
      });
    }
  }

  const recentSleep = sorted
    .map((d) => d.sleepDurationMin)
    .filter((v): v is number => v != null);
  if (checkSleepAlert(recentSleep)) {
    alerts.push({
      metric: "sleep",
      title: "Poor sleep trend",
      body: "Sleep duration has been under 5 hours for 3 consecutive nights.",
      value: recentSleep[recentSleep.length - 1],
      baseline: 300,
    });
  }

  if (alerts.length === 0) return;

  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: { clerkOrgId: true },
  });
  if (!client?.clerkOrgId) return;

  const trainers = await prisma.user.findMany({
    where: { clerkOrgId: client.clerkOrgId, role: "TRAINER" },
    select: { id: true },
  });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Fetch recent wearable alerts once and dedupe in application code —
  // MongoDB's support for Prisma's JSON `path` filter isn't something to
  // assume without live verification, so this avoids relying on it.
  const recentAlerts = await prisma.notification.findMany({
    where: { type: "WEARABLE_ALERT", createdAt: { gte: since } },
    select: { metadata: true },
  });

  for (const alert of alerts) {
    const alreadyAlerted = recentAlerts.some((n) => {
      const meta = n.metadata as { clientId?: string; metric?: string } | null;
      return meta?.clientId === clientId && meta?.metric === alert.metric;
    });
    if (alreadyAlerted) continue;

    for (const trainer of trainers) {
      await createNotification({
        userId: trainer.id,
        type: "WEARABLE_ALERT",
        title: alert.title,
        body: alert.body,
        link: `/clients/${clientId}/progress`,
        metadata: { clientId, metric: alert.metric, value: alert.value, baseline: alert.baseline },
      });
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/services/__tests__/wearable-alert.service.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/services/wearable-alert.service.ts lib/services/__tests__/wearable-alert.service.test.ts
git commit -m "feat(wearables): add clinical alert threshold logic"
```

---

### Task 5: Server actions for connect/disconnect

**Files:**
- Create: `actions/wearable-actions.ts`
- Test: `actions/__tests__/wearable-actions.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser` (`lib/current-user.ts`), `getOrCreateVitalUserId`, `createLinkToken` (Task 2), `upsertConnection` (Task 3).
- Produces: `createWearableLinkTokenAction(): Promise<{success, data: {linkToken}} | {success: false, error}>`, `disconnectWearableAction(provider: WearableProvider)` — consumed by Task 7 (settings UI). Note: connection *reads* go directly through `getConnectionsForClient` (Task 3) from the server-component settings page, not through a server action — no action wrapper is needed for a read that only ever happens during server-side rendering.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/wearable-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/vital", () => ({
  getOrCreateVitalUserId: vi.fn(),
  createLinkToken: vi.fn(),
}));
vi.mock("@/lib/services/wearable.service", () => ({
  upsertConnection: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getCurrentUser } from "@/lib/current-user";
import { getOrCreateVitalUserId, createLinkToken } from "@/lib/vital";
import { upsertConnection } from "@/lib/services/wearable.service";
import {
  createWearableLinkTokenAction,
  disconnectWearableAction,
} from "../wearable-actions";

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockGetOrCreateVitalUserId = vi.mocked(getOrCreateVitalUserId);
const mockCreateLinkToken = vi.mocked(createLinkToken);
const mockUpsertConnection = vi.mocked(upsertConnection);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createWearableLinkTokenAction", () => {
  it("rejects non-client users", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "trainer_1", role: "TRAINER" } as never);

    const result = await createWearableLinkTokenAction();

    expect(result).toEqual({ success: false, error: "Only clients can connect a wearable" });
  });

  it("returns a link token for a client", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "client_1", role: "CLIENT" } as never);
    mockGetOrCreateVitalUserId.mockResolvedValue("vital_user_1");
    mockCreateLinkToken.mockResolvedValue("token_abc");

    const result = await createWearableLinkTokenAction();

    expect(result).toEqual({ success: true, data: { linkToken: "token_abc" } });
  });
});

describe("disconnectWearableAction", () => {
  it("marks the connection DISCONNECTED for the current client", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "client_1", role: "CLIENT" } as never);

    const result = await disconnectWearableAction("OURA");

    expect(mockUpsertConnection).toHaveBeenCalledWith("client_1", "OURA", "DISCONNECTED");
    expect(result).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run actions/__tests__/wearable-actions.test.ts`
Expected: FAIL with `Cannot find module '../wearable-actions'`.

- [ ] **Step 3: Implement `actions/wearable-actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import { getOrCreateVitalUserId, createLinkToken } from "@/lib/vital";
import { upsertConnection } from "@/lib/services/wearable.service";
import type { WearableProvider } from "@prisma/client";

export async function createWearableLinkTokenAction() {
  const user = await getCurrentUser();
  if (user.role !== "CLIENT") {
    return { success: false as const, error: "Only clients can connect a wearable" };
  }

  try {
    const vitalUserId = await getOrCreateVitalUserId(user.id);
    const linkToken = await createLinkToken(vitalUserId);
    return { success: true as const, data: { linkToken } };
  } catch (error) {
    console.error("Failed to create wearable link token:", error);
    return { success: false as const, error: "Failed to start wearable connection" };
  }
}

export async function disconnectWearableAction(provider: WearableProvider) {
  const user = await getCurrentUser();
  if (user.role !== "CLIENT") {
    return { success: false as const, error: "Only clients can disconnect a wearable" };
  }

  try {
    await upsertConnection(user.id, provider, "DISCONNECTED");
    revalidatePath("/settings");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to disconnect wearable:", error);
    return { success: false as const, error: "Failed to disconnect wearable" };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run actions/__tests__/wearable-actions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add actions/wearable-actions.ts actions/__tests__/wearable-actions.test.ts
git commit -m "feat(wearables): add connect/disconnect server actions"
```

---

### Task 6: Webhook endpoint

**Files:**
- Create: `app/api/webhooks/vital/route.ts`
- Test: `app/api/webhooks/vital/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `mapJunctionSlugToProvider` (Task 2), `upsertConnection`, `upsertDailySummaryFields`, `upsertWorkout` (Task 3), `evaluateWearableAlerts` (Task 4), `svix` package (already a dependency).
- Produces: `POST /api/webhooks/vital` route handler. Terminal — no later task consumes this directly; Junction's dashboard is configured to point at it (see Step 6, a manual deployment step, not code).

**Note on payload field names:** Junction's confirmed real webhook shape is `{ event_type, data, user_id, client_user_id, team_id }`; a confirmed real example for `daily.data.activity.updated` has `data: { calendar_date, steps, calories_active, calories_total, source: { slug } }`. Junction's docs reference sleep/body/workout examples living in their dashboard's "Event Catalog" tab, not in public docs — the field names below (`data.duration_minutes`, `data.avg_hrv_sdnn`, `data.resting_hr`, `data.time_start`/`data.time_end`, `data.calories_total`) are this plan's best-informed mapping. **Before wiring this up against a real Junction webhook subscription, use Junction's sandbox synthetic-data tool (`docs.junction.com/wearables/providers/test_data`) to fire one real test event per type and confirm/adjust these field names against the actual payload** — this is a one-time verification step, not a design gap.

- [ ] **Step 1: Write the failing test**

Create `app/api/webhooks/vital/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockVerify = vi.fn();
vi.mock("svix", () => ({
  Webhook: vi.fn().mockImplementation(() => ({ verify: mockVerify })),
}));
vi.mock("@/lib/services/wearable.service", () => ({
  upsertConnection: vi.fn(),
  upsertDailySummaryFields: vi.fn(),
  upsertWorkout: vi.fn(),
}));
vi.mock("@/lib/services/wearable-alert.service", () => ({
  evaluateWearableAlerts: vi.fn(),
}));
vi.mock("@/lib/vital", () => ({
  mapJunctionSlugToProvider: vi.fn(() => "OURA"),
}));

import {
  upsertConnection,
  upsertDailySummaryFields,
} from "@/lib/services/wearable.service";
import { evaluateWearableAlerts } from "@/lib/services/wearable-alert.service";
import { POST } from "../route";

const mockUpsertConnection = vi.mocked(upsertConnection);
const mockUpsertDailySummaryFields = vi.mocked(upsertDailySummaryFields);
const mockEvaluateAlerts = vi.mocked(evaluateWearableAlerts);

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/webhooks/vital", {
    method: "POST",
    headers: {
      "svix-id": "msg_1",
      "svix-timestamp": "1234567890",
      "svix-signature": "v1,fake",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VITAL_WEBHOOK_SECRET = "whsec_test";
});

describe("POST /api/webhooks/vital", () => {
  it("returns 400 when signature verification fails", async () => {
    mockVerify.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
  });

  it("upserts a connection on provider.connection.created", async () => {
    const payload = {
      event_type: "provider.connection.created",
      client_user_id: "client_1",
      data: { source: { slug: "oura" } },
    };
    mockVerify.mockReturnValue(payload);

    const res = await POST(makeRequest(payload));

    expect(res.status).toBe(200);
    expect(mockUpsertConnection).toHaveBeenCalledWith("client_1", "OURA", "CONNECTED");
  });

  it("upserts activity data and runs alert evaluation on daily.data.activity.updated", async () => {
    const payload = {
      event_type: "daily.data.activity.updated",
      client_user_id: "client_1",
      data: {
        calendar_date: "2026-07-01",
        steps: 8000,
        calories_active: 300,
        source: { slug: "oura" },
      },
    };
    mockVerify.mockReturnValue(payload);

    const res = await POST(makeRequest(payload));

    expect(res.status).toBe(200);
    expect(mockUpsertDailySummaryFields).toHaveBeenCalledWith(
      "client_1",
      new Date("2026-07-01T00:00:00.000Z"),
      "OURA",
      { steps: 8000, activeMinutes: undefined, caloriesBurned: 300 }
    );
    expect(mockEvaluateAlerts).toHaveBeenCalledWith("client_1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/webhooks/vital/__tests__/route.test.ts`
Expected: FAIL with `Cannot find module '../route'`.

- [ ] **Step 3: Implement `app/api/webhooks/vital/route.ts`**

```typescript
import { Webhook } from "svix";
import { NextResponse } from "next/server";
import {
  upsertConnection,
  upsertDailySummaryFields,
  upsertWorkout,
} from "@/lib/services/wearable.service";
import { evaluateWearableAlerts } from "@/lib/services/wearable-alert.service";
import { mapJunctionSlugToProvider } from "@/lib/vital";

interface JunctionEvent {
  event_type: string;
  client_user_id: string;
  data: Record<string, unknown>;
}

export async function POST(req: Request) {
  const secret = process.env.VITAL_WEBHOOK_SECRET;
  if (!secret) {
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new NextResponse("Missing svix headers", { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(secret);

  let event: JunctionEvent;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as JunctionEvent;
  } catch {
    return new NextResponse("Webhook verification failed", { status: 400 });
  }

  const clientId = event.client_user_id;
  const data = event.data;
  const source = data.source as { slug?: string } | undefined;
  const provider = mapJunctionSlugToProvider(source?.slug ?? "");

  switch (event.event_type) {
    case "provider.connection.created": {
      await upsertConnection(clientId, provider, "CONNECTED");
      break;
    }
    case "provider.connection.error": {
      await upsertConnection(clientId, provider, "ERROR");
      break;
    }
    case "daily.data.activity.created":
    case "daily.data.activity.updated": {
      const date = new Date(`${data.calendar_date as string}T00:00:00.000Z`);
      await upsertDailySummaryFields(clientId, date, provider, {
        steps: data.steps as number | undefined,
        activeMinutes: data.active_duration_minutes as number | undefined,
        caloriesBurned: data.calories_active as number | undefined,
      });
      await evaluateWearableAlerts(clientId);
      break;
    }
    case "daily.data.sleep.created":
    case "daily.data.sleep.updated": {
      const date = new Date(`${data.calendar_date as string}T00:00:00.000Z`);
      await upsertDailySummaryFields(clientId, date, provider, {
        sleepDurationMin: data.duration_minutes as number | undefined,
        sleepScore: data.score as number | undefined,
      });
      await evaluateWearableAlerts(clientId);
      break;
    }
    case "daily.data.body.created":
    case "daily.data.body.updated": {
      const date = new Date(`${data.calendar_date as string}T00:00:00.000Z`);
      await upsertDailySummaryFields(clientId, date, provider, {
        restingHeartRate: data.resting_hr as number | undefined,
        hrvMs: data.avg_hrv_sdnn as number | undefined,
      });
      await evaluateWearableAlerts(clientId);
      break;
    }
    case "daily.data.workouts.created":
    case "daily.data.workouts.updated": {
      await upsertWorkout(clientId, provider, data.id as string, {
        activityType: (data.activity_type as string) ?? "unknown",
        startedAt: new Date(data.time_start as string),
        endedAt: new Date(data.time_end as string),
        durationMinutes: Math.round(
          (new Date(data.time_end as string).getTime() -
            new Date(data.time_start as string).getTime()) /
            60_000
        ),
        avgHeartRate: data.heart_rate_avg as number | undefined,
        caloriesBurned: data.calories_total as number | undefined,
        raw: data as never,
      });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/webhooks/vital/__tests__/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/webhooks/vital/route.ts app/api/webhooks/vital/__tests__/route.test.ts
git commit -m "feat(wearables): add Junction webhook ingestion endpoint"
```

- [ ] **Step 6: Manual deployment step (not code) — register the webhook**

In the Junction dashboard, add an endpoint pointing to `https://<your-deployed-domain>/api/webhooks/vital`, subscribe it to `provider.connection.created`, `provider.connection.error`, `daily.data.activity.*`, `daily.data.sleep.*`, `daily.data.body.*`, `daily.data.workouts.*`, then copy the "Signing Secret" into `VITAL_WEBHOOK_SECRET` in your deployment's environment variables. Use their sandbox synthetic-data tool to fire one test event per type and confirm the field names in Step 3 match — adjust the `data.*` field accessors above if they don't.

---

### Task 7: Client settings — connect/disconnect UI

**Files:**
- Create: `components/settings/wearable-connection-card.tsx`
- Modify: `app/(platform)/settings/page.tsx`

**Interfaces:**
- Consumes: `createWearableLinkTokenAction`, `disconnectWearableAction` (Task 5), `getConnectionsForClient` (Task 3), `useVitalLink` from `@tryvital/vital-link` (Task 2 install), `getCurrentUser` (existing).
- Produces: rendered UI only — no exports consumed by later tasks.

- [ ] **Step 1: Implement `components/settings/wearable-connection-card.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useVitalLink } from "@tryvital/vital-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Watch } from "lucide-react";
import {
  createWearableLinkTokenAction,
  disconnectWearableAction,
} from "@/actions/wearable-actions";
import type { WearableConnection } from "@prisma/client";

interface WearableConnectionCardProps {
  initialConnections: WearableConnection[];
}

export function WearableConnectionCard({
  initialConnections,
}: WearableConnectionCardProps) {
  const [connections, setConnections] = useState(initialConnections);
  const [isPending, startTransition] = useTransition();

  const { open, ready } = useVitalLink({
    env: process.env.NEXT_PUBLIC_VITAL_ENV === "production" ? "production" : "sandbox",
    region: "us",
    onSuccess: () => {
      window.location.reload();
    },
  });

  const handleConnect = () => {
    startTransition(async () => {
      const result = await createWearableLinkTokenAction();
      if (result.success) {
        open(result.data.linkToken);
      }
    });
  };

  const handleDisconnect = (provider: WearableConnection["provider"]) => {
    startTransition(async () => {
      const result = await disconnectWearableAction(provider);
      if (result.success) {
        setConnections((prev) => prev.filter((c) => c.provider !== provider));
      }
    });
  };

  const activeConnections = connections.filter((c) => c.status === "CONNECTED");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Watch className="h-4.5 w-4.5" />
          Wearable Device
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeConnections.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              Connect Apple Watch, Fitbit, Garmin, Oura, or Whoop to share your
              sleep, heart rate, and activity data with your trainer.
            </p>
            <Button size="sm" disabled={!ready || isPending} onClick={handleConnect}>
              Connect a wearable
            </Button>
          </>
        ) : (
          <div className="space-y-2">
            {activeConnections.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-border/60 p-3"
              >
                <div>
                  <p className="text-sm font-medium">{c.provider.replace("_", " ")}</p>
                  <Badge variant="outline" className="mt-1 text-xs">
                    Connected
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => handleDisconnect(c.provider)}
                >
                  Disconnect
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into the settings page**

Modify `app/(platform)/settings/page.tsx`:

```typescript
import { UserProfile } from "@clerk/nextjs"
import { getCurrentUser } from "@/lib/current-user"
import { getConnectionsForClient } from "@/lib/services/wearable.service"
import { WearableConnectionCard } from "@/components/settings/wearable-connection-card"

export default async function SettingsPage() {
  const user = await getCurrentUser()
  const connections =
    user.role === "CLIENT" ? await getConnectionsForClient(user.id) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account and profile</p>
      </div>

      {user.role === "CLIENT" && (
        <WearableConnectionCard initialConnections={connections} />
      )}

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

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, sign in as a CLIENT-role user, open `/settings`.
Expected: a "Wearable Device" card renders above the Clerk profile widget, showing the "Connect a wearable" button.

- [ ] **Step 4: Commit**

```bash
git add components/settings/wearable-connection-card.tsx "app/(platform)/settings/page.tsx"
git commit -m "feat(wearables): add client settings connect/disconnect UI"
```

---

### Task 8: Client dashboard — today's activity card

**Files:**
- Create: `components/dashboard/wearable-summary-card.tsx`
- Modify: `components/dashboard/client-dashboard.tsx`
- Modify: `app/(platform)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getLatestDailySummary` (Task 3).
- Produces: rendered UI only.

- [ ] **Step 1: Implement `components/dashboard/wearable-summary-card.tsx`**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Moon, HeartPulse } from "lucide-react";
import type { WearableDailySummary } from "@prisma/client";

interface WearableSummaryCardProps {
  summary: WearableDailySummary;
}

export function WearableSummaryCard({ summary }: WearableSummaryCardProps) {
  const items = [
    {
      icon: Activity,
      label: "Steps",
      value: summary.steps != null ? summary.steps.toLocaleString() : "—",
    },
    {
      icon: Moon,
      label: "Sleep",
      value:
        summary.sleepDurationMin != null
          ? `${Math.floor(summary.sleepDurationMin / 60)}h ${summary.sleepDurationMin % 60}m`
          : "—",
    },
    {
      icon: HeartPulse,
      label: "Resting HR",
      value: summary.restingHeartRate != null ? `${summary.restingHeartRate} bpm` : "—",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Today&apos;s Activity</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-4">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex flex-col items-center gap-1 text-center">
            <Icon className="h-4.5 w-4.5 text-muted-foreground" />
            <p className="text-lg font-bold leading-none">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add a `wearableSummary` prop to `ClientDashboard` and render the card**

In `components/dashboard/client-dashboard.tsx`, add the import (below the existing `ClientSessionCalendar` import):

```typescript
import { WearableSummaryCard } from "./wearable-summary-card";
import type { WearableDailySummary } from "@prisma/client";
```

Add `wearableSummary` to the props interface:

```typescript
interface ClientDashboardProps {
  upcomingSessions: {
    id: string;
    scheduledDate: Date;
    status: string;
    workout?: { name?: string | null } | null;
  }[];
  calendarSessions: {
    id: string;
    scheduledDate: Date;
    status: string;
    workout: {
      name: string | null;
      blocks: { exercises: { id: string }[] }[];
    } | null;
  }[];
  weeklyCompliance: number;
  recentAssessments: { id: string; assessmentType: string; value: number; unit: string; createdAt: Date }[];
  unreadMessages: number;
  wearableSummary: WearableDailySummary | null;
}
```

Add `wearableSummary` to the destructured function params:

```typescript
export function ClientDashboard({
  upcomingSessions,
  calendarSessions,
  weeklyCompliance,
  recentAssessments,
  unreadMessages,
  wearableSummary,
}: ClientDashboardProps) {
```

Insert the card between the "Weekly Progress" `<Card>` block and `<ClientSessionCalendar sessions={calendarSessions} />`:

```typescript
      {/* Wearable summary — only when a device has synced data */}
      {wearableSummary && <WearableSummaryCard summary={wearableSummary} />}

      {/* Schedule calendar */}
      <ClientSessionCalendar sessions={calendarSessions} />
```

- [ ] **Step 3: Pass the data from the dashboard page**

In `app/(platform)/dashboard/page.tsx`, add the import:

```typescript
import { getLatestDailySummary } from "@/lib/services/wearable.service";
```

Add `getLatestDailySummary(user.id)` as a fifth entry in the client-branch `Promise.all` array (after `completedThisWeek`'s query):

```typescript
  const [recentAssessments, unreadMessages, calendarSessions, completedThisWeek, wearableSummary] = await Promise.all([
    prisma.assessment.findMany({
      where: { clientId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.message.count({ where: { recipientId: user.id, isRead: false } }),
    prisma.workoutSessionV2.findMany({
      where: {
        clientId: user.id,
        scheduledDate: { gte: calendarStart, lte: calendarEnd },
      },
      select: {
        id: true,
        scheduledDate: true,
        status: true,
        workout: {
          select: {
            name: true,
            blocks: {
              select: {
                exercises: { select: { id: true } },
              },
            },
          },
        },
      },
      orderBy: { scheduledDate: "asc" },
    }),
    prisma.workoutSessionV2.count({
      where: {
        clientId: user.id,
        status: "COMPLETED",
        completedAt: { gte: weekStart, lte: weekEnd },
      },
    }),
    getLatestDailySummary(user.id),
  ]);
```

Pass it to the component:

```typescript
  return (
    <ClientDashboard
      upcomingSessions={upcomingSessions as any}
      calendarSessions={calendarSessions as any}
      weeklyCompliance={completedThisWeek}
      recentAssessments={recentAssessments}
      unreadMessages={unreadMessages}
      wearableSummary={wearableSummary}
    />
  );
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, sign in as a CLIENT with at least one `WearableDailySummary` row (insert one via `npx prisma studio` if needed), open `/dashboard`.
Expected: "Today's Activity" card renders with steps/sleep/resting HR values.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/wearable-summary-card.tsx components/dashboard/client-dashboard.tsx "app/(platform)/dashboard/page.tsx"
git commit -m "feat(wearables): add today's activity card to client dashboard"
```

---

### Task 9: Trainer progress page — Wearables tab

**Files:**
- Create: `components/progress/wearables-tab.tsx`
- Create: `components/progress/wearable-trend-chart.tsx`
- Modify: `app/(platform)/clients/[id]/progress/page.tsx`

**Interfaces:**
- Consumes: `getDailySummariesForClient`, `getWorkoutsForClient`, `getConnectionsForClient` (Task 3).
- Produces: rendered UI only — terminal task.

- [ ] **Step 1: Implement `components/progress/wearable-trend-chart.tsx`**

```typescript
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import type { WearableDailySummary } from "@prisma/client";

interface WearableTrendChartProps {
  data: WearableDailySummary[];
  metric: "steps" | "sleepDurationMin" | "restingHeartRate" | "hrvMs";
  label: string;
}

export function WearableTrendChart({ data, metric, label }: WearableTrendChartProps) {
  const chartData = data
    .filter((d) => d[metric] != null)
    .map((d) => ({
      date: format(new Date(d.date), "MMM d"),
      value: d[metric] as number,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border">
        <p className="text-sm text-muted-foreground">No {label.toLowerCase()} data yet.</p>
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip />
          <Line type="monotone" dataKey="value" name={label} stroke="#3b82f6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Implement `components/progress/wearables-tab.tsx`**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WearableTrendChart } from "@/components/progress/wearable-trend-chart";
import { format } from "date-fns";
import type {
  WearableConnection,
  WearableDailySummary,
  WearableWorkout,
} from "@prisma/client";

interface WearablesTabProps {
  connections: WearableConnection[];
  summaries: WearableDailySummary[];
  workouts: WearableWorkout[];
}

export function WearablesTab({ connections, summaries, workouts }: WearablesTabProps) {
  const connected = connections.filter((c) => c.status === "CONNECTED");

  if (connected.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="text-base font-medium text-muted-foreground">
          No wearable connected yet
        </p>
        <p className="text-sm text-muted-foreground/70">
          Data will appear here once the client connects a device from their settings page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {connected.map((c) => (
          <Badge key={c.id} variant="outline">
            {c.provider.replace("_", " ")}
          </Badge>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Sleep (minutes)</CardTitle>
          </CardHeader>
          <CardContent>
            <WearableTrendChart data={summaries} metric="sleepDurationMin" label="Sleep" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Resting Heart Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <WearableTrendChart
              data={summaries}
              metric="restingHeartRate"
              label="Resting HR"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">HRV</CardTitle>
          </CardHeader>
          <CardContent>
            <WearableTrendChart data={summaries} metric="hrvMs" label="HRV" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Daily Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <WearableTrendChart data={summaries} metric="steps" label="Steps" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Recent Workouts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {workouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No device-detected workouts yet.</p>
          ) : (
            workouts.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between rounded-xl border border-border/60 p-3"
              >
                <div>
                  <p className="text-sm font-medium capitalize">{w.activityType}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(w.startedAt), "MMM d, yyyy · h:mm a")}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">{w.durationMinutes} min</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Wire the tab into the progress page**

Modify `app/(platform)/clients/[id]/progress/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/current-user";
import { getClientDetail } from "@/lib/services/client.service";
import * as progressService from "@/lib/services/progress.service";
import * as noteService from "@/lib/services/clinical-note.service";
import {
  getConnectionsForClient,
  getDailySummariesForClient,
  getWorkoutsForClient,
} from "@/lib/services/wearable.service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { PhotosTab } from "@/components/progress/photos-tab";
import { MetricsTab } from "@/components/progress/metrics-tab";
import { SoapNotesTab } from "@/components/progress/soap-notes-tab";
import { WearablesTab } from "@/components/progress/wearables-tab";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientProgressPage({ params }: Props) {
  const { id } = await params;
  const user = await requireRole("TRAINER");
  const client = await getClientDetail(id);

  if (!client) notFound();

  const [photos, metrics, metricTypes, notes, wearableConnections, wearableSummaries, wearableWorkouts] =
    await Promise.all([
      progressService.getProgressPhotos(client.id),
      progressService.getBodyMetrics(client.id),
      progressService.getBodyMetricTypes(client.id),
      noteService.getNotesForClient(client.id, user.id),
      getConnectionsForClient(client.id),
      getDailySummariesForClient(client.id, 30),
      getWorkoutsForClient(client.id),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/clients/${id}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Client
          </Link>
        </Button>
      </div>

      <Card className="border-0 shadow-sm ring-1 ring-border/50">
        <CardContent className="flex items-center gap-5 p-5">
          <Avatar className="h-14 w-14">
            <AvatarImage src={client.imageUrl ?? undefined} />
            <AvatarFallback className="text-base">
              {client.firstName[0]}
              {client.lastName[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-lg font-bold">
              {client.firstName} {client.lastName}
            </h1>
            <p className="text-sm text-muted-foreground">{client.email}</p>
          </div>
          <div className="ml-auto">
            <p className="text-right text-sm font-semibold text-muted-foreground">
              Progress Tracking
            </p>
            <p className="text-right text-xs text-muted-foreground/70">
              {photos.length} photos &middot; {metricTypes.length} metric types &middot; {notes.length} notes
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="photos">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="photos">
            Progress Photos ({photos.length})
          </TabsTrigger>
          <TabsTrigger value="metrics">
            Body Metrics ({metricTypes.length})
          </TabsTrigger>
          <TabsTrigger value="notes">
            Clinical Notes — SOAP ({notes.length})
          </TabsTrigger>
          <TabsTrigger value="wearables">
            Wearables ({wearableConnections.filter((c) => c.status === "CONNECTED").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="photos" className="mt-5">
          <PhotosTab photos={photos} clientId={client.id} />
        </TabsContent>

        <TabsContent value="metrics" className="mt-5">
          <MetricsTab
            metrics={metrics}
            metricTypes={metricTypes}
            clientId={client.id}
          />
        </TabsContent>

        <TabsContent value="notes" className="mt-5">
          <SoapNotesTab notes={notes} clientId={client.id} />
        </TabsContent>

        <TabsContent value="wearables" className="mt-5">
          <WearablesTab
            connections={wearableConnections}
            summaries={wearableSummaries}
            workouts={wearableWorkouts}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, sign in as a TRAINER, open a client's `/clients/[id]/progress` page.
Expected: a "Wearables" tab appears; with no connection it shows the empty state, with seeded `WearableDailySummary`/`WearableWorkout` rows (insert via `npx prisma studio`) it shows trend charts and a workouts list.

- [ ] **Step 5: Commit**

```bash
git add components/progress/wearables-tab.tsx components/progress/wearable-trend-chart.tsx "app/(platform)/clients/[id]/progress/page.tsx"
git commit -m "feat(wearables): add trainer-facing wearables tab to client progress page"
```

---

## Out of scope (matches spec)

- Configurable per-clinician alert thresholds.
- Cross-referencing device workouts against assigned `WorkoutPlan`/`Program` sessions.
- Historical backfill logic in our own code (Junction handles this automatically).
- Junction BAA execution — a legal/procurement step, not engineering work, but required before this feature handles real client data in production.
