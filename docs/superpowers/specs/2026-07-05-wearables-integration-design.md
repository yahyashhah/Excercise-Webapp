# Wearables Integration Design

## Purpose

Give clinicians objective, continuous recovery signal for their clients between sessions — sleep, resting heart rate, HRV, daily activity, and device-detected workouts — sourced from Apple Watch, Fitbit, Garmin, Oura, and Whoop. This is clinical monitoring, not a fitness-engagement gimmick: the data should help a clinician catch overtraining, non-adherence, or a recovery regression before the client reports symptoms.

## Vendor decision

Integrating with each wearable's native API directly (HealthKit, Fitbit API, Garmin API, etc.) would require building and maintaining a native iOS companion app (mandatory for HealthKit — there is no cloud API for it) plus N separate OAuth integrations. That's a multi-month build, not a feature addition.

Instead we integrate through **Vital (rebranded "Junction")**, an aggregator that handles all device-specific SDKs/OAuth and normalizes everything into one webhook schema.

**Why Junction over Terra** (the other major aggregator):
- Built healthcare-first; BAA is standard for customers handling PHI, not gated behind an Enterprise sales negotiation the way Terra's is.
- Cheaper at this app's current client volume (~$0.50/user/mo, $300/mo minimum vs. Terra's $399-499/mo flat).
- Covers all the metrics needed (sleep, HRV, resting HR, activity, workouts). Terra's one edge — live in-workout HR/GPS streaming — isn't needed here since this is daily/nightly clinical monitoring, not live session tracking.
- Uses **Svix** for webhook delivery, same as this app's existing Clerk webhook — so verification code is a near-direct reuse of an established pattern.

This app is not currently HIPAA-covered in a fully audited sense, but it stores clinical data (`ClinicalNote`, diagnoses on `ClientProfile`) that puts it in business-associate territory if any clinician-users are licensed providers treating patients. A signed BAA with Junction is a prerequisite for going live with real client data, not just a nice-to-have — this should be executed before this feature reaches production, in parallel with the engineering work below.

## Architecture & data flow

1. Client clicks "Connect a wearable" in their settings page.
2. Backend calls Junction's Link API to create/fetch a Junction user mapped to the client's `User.id`, returns a Link token.
3. Client's browser opens Junction's hosted Link widget; client authorizes their device (Apple Health via Junction's SDK, or OAuth for Fitbit/Garmin/Oura/Whoop).
4. Junction sends a `provider.connection.created` webhook — we create a `WearableConnection` row.
5. Junction automatically schedules a historical backfill on connection, then continues sending webhooks as new data is discovered on the device (near-real-time, not batch).
6. Our webhook endpoint verifies the Svix signature, upserts normalized data into `WearableDailySummary` / `WearableWorkout`, and runs alert-threshold checks.
7. Clinicians see the data on a client's progress page; clients see a summary card on their own dashboard.

We never talk to Apple/Fitbit/Garmin directly — Junction is the only external integration surface.

## Data model

Three new Prisma models, kept separate from `BodyMetric` (manual, low-frequency, single-value-per-row) since wearable data has different shape (multiple values per day) and provenance (device vs. manual entry):

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

model WearableConnection {
  id             String                    @id @default(auto()) @map("_id") @db.ObjectId
  clientId       String                    @map("patientId") @db.ObjectId
  client         User                      @relation("WearableConnections", fields: [clientId], references: [id])
  vitalUserId    String                    @unique
  provider       WearableProvider
  status         WearableConnectionStatus  @default(CONNECTED)
  connectedAt    DateTime                  @default(now())
  lastSyncedAt   DateTime?
  disconnectedAt DateTime?

  @@index([clientId])
}

model WearableDailySummary {
  id               String   @id @default(auto()) @map("_id") @db.ObjectId
  clientId         String   @map("patientId") @db.ObjectId
  client           User     @relation("WearableDailySummaries", fields: [clientId], references: [id])
  date             DateTime // day-level, normalized to UTC midnight
  provider         WearableProvider
  sleepDurationMin Int?
  sleepScore       Int?
  restingHeartRate Int?
  hrvMs            Float?
  steps            Int?
  activeMinutes    Int?
  caloriesBurned   Int?
  raw              Json?    // original Junction payload, for audit/debugging
  createdAt        DateTime @default(now())

  @@unique([clientId, date, provider])
  @@index([clientId, date])
}

model WearableWorkout {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  clientId        String   @map("patientId") @db.ObjectId
  client          User     @relation("WearableWorkouts", fields: [clientId], references: [id])
  provider        WearableProvider
  externalId      String   // Junction's workout id, for idempotent upsert
  activityType    String
  startedAt       DateTime
  endedAt         DateTime
  durationMinutes Int
  avgHeartRate    Int?
  caloriesBurned  Int?
  raw             Json?
  createdAt       DateTime @default(now())

  @@unique([provider, externalId])
  @@index([clientId, startedAt])
}
```

No new fields needed on `Notification` — its existing `type: String` + `metadata: Json` shape covers wearable alerts (`type: "WEARABLE_ALERT"`).

`User` also needs the three corresponding back-relations added:

```prisma
wearableConnections    WearableConnection[]    @relation("WearableConnections")
wearableDailySummaries WearableDailySummary[]  @relation("WearableDailySummaries")
wearableWorkouts       WearableWorkout[]       @relation("WearableWorkouts")
```

## Webhook handling

Endpoint: `app/api/webhooks/vital/route.ts`, verified with the `svix` package (already a dependency via the Clerk webhook) and a `VITAL_WEBHOOK_SECRET` env var. Creating link tokens also requires a `VITAL_API_KEY` (and region/environment config, e.g. sandbox vs. production) for server-to-server calls to Junction's Link API.

| Junction event | Action |
|---|---|
| `provider.connection.created` | Upsert `WearableConnection`, status `CONNECTED` |
| `provider.connection.error` | Update `WearableConnection` status to `ERROR` |
| `daily.data.sleep.created` / `.updated` | Upsert `WearableDailySummary` sleep fields, keyed `[clientId, date, provider]` |
| `daily.data.activity.created` / `.updated` | Upsert `WearableDailySummary` activity fields |
| `daily.data.body.created` / `.updated` | Upsert `WearableDailySummary` restingHeartRate/hrvMs |
| `daily.data.workouts.created` / `.updated` | Upsert `WearableWorkout`, keyed `[provider, externalId]` |

All writes are upserts on a natural key, so Svix retries or Junction's historical-backfill burst on first connection are handled idempotently without special-casing.

## Alerting

Runs synchronously after each `WearableDailySummary` upsert, scoped to the three biometric signals (workout data is displayed only, not alerted on — keeps v1 scope tight):

- **Resting HR**: today's value > 7-day trailing average (excluding today) + 10%
- **HRV**: today's value < 7-day trailing average − 15%
- **Sleep**: duration < 5 hours for 3 consecutive nights

Each rule requires ≥5 days of prior data before it can fire, to avoid false positives right after a device connects. On trigger, create a `Notification` for the assigned trainer (`type: "WEARABLE_ALERT"`, `metadata: { clientId, metric, value, baseline }`), deduped to at most one open alert per `(clientId, metric)` per 24 hours.

## UI surfaces

- **Client settings page** (`app/(platform)/settings/page.tsx`): today this page only renders Clerk's `<UserProfile>` for every role. Add a new "Wearable Device" section above it, rendered only when the signed-in user's role is `CLIENT`, with a "Connect a wearable" action opening the Junction Link widget, connection status (device, last synced), and a disconnect action.
- **Client dashboard**: a "Today's Activity" card (steps, sleep, resting HR) from the latest `WearableDailySummary`, shown only when a connection exists.
- **Trainer's client progress page** (`app/(platform)/clients/[id]/progress/page.tsx`): a new "Wearables" tab alongside Photos / Body Metrics / SOAP Notes — trend charts (reusing the existing Recharts setup from `progress-chart.tsx`) for sleep/HR/HRV/activity, a workouts list, and any open alerts surfaced at the top of the tab.

## Error handling

- Invalid webhook signature → 400, logged, no DB write.
- `provider.connection.error` → connection status flips to `ERROR`; client sees a reconnect prompt instead of the data silently going stale.
- Historical backfill burst on first connect → handled by idempotent upserts, no special casing needed.
- Insufficient history (<5 days) → alert rules simply don't fire yet; no dedicated error state.

## Testing strategy

- Webhook handler: tested against recorded fixture payloads for each event type, signature verified against a test secret — not against Junction's live API.
- Alert-threshold logic: tested as pure functions given a baseline + today's value, independent of the webhook plumbing.

## Out of scope for v1

- Configurable/per-clinician alert thresholds (hardcoded defaults for now).
- Cross-referencing device-detected workouts against assigned `WorkoutPlan`/`Program` sessions to flag missed workouts.
- Any device beyond what Junction supports out of the box.
