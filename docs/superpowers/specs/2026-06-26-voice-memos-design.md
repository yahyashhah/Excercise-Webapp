# Voice Memos Feature Design

**Date:** 2026-06-26
**Status:** Approved

## Problem Statement

Trainers need a way to leave audio coaching notes on specific workouts so clients have context before or during a session. Clients need a way to respond with audio feedback after completing a workout. Both flows should feel like a lightweight voice messaging thread attached to each workout.

## Decision Summary

- Voice memos are attached at the **workout level** (one trainer memo + one client memo per workout)
- Trainer records when building/editing a program; client records at **workout completion only**
- Storage: **Cloudflare R2** via presigned URL direct upload (S3-compatible `@aws-sdk/client-s3`)
- **UploadThing is removed entirely** — exercise video/image/photo upload UI is removed (YouTube covers exercise media)
- Max duration: **5 minutes** (enforced client-side and server-side)
- Notifications: **bidirectional** — Pusher (real-time) + Resend (email)
- A **Voice Messages feed** on the trainer nav surfaces all client responses inbox-style

---

## Data Model

### New Prisma model: `VoiceMemo`

```prisma
model VoiceMemo {
  id          String        @id @default(auto()) @map("_id") @db.ObjectId
  workoutId   String        @db.ObjectId
  workout     Workout       @relation(fields: [workoutId], references: [id], onDelete: Cascade)
  authorId    String        // Clerk userId
  authorRole  VoiceMemoRole
  r2Key       String        // full R2 object key, used for deletion
  r2Url       String        // public CDN URL used for playback
  durationSec Int           // seconds, validated <= 300
  isRead      Boolean       @default(false)
  createdAt   DateTime      @default(now())
}

enum VoiceMemoRole {
  TRAINER
  CLIENT
}
```

**Constraints (enforced at action layer):**
- One memo per `(workoutId, authorRole)` pair — re-recording replaces the existing memo
- On replace: old R2 object is deleted before new record is written
- `onDelete: Cascade` — deleting a workout deletes its memos

### Workout model update

Add relation back:
```prisma
model Workout {
  // ... existing fields ...
  voiceMemos  VoiceMemo[]
}
```

---

## R2 Storage

### Environment Variables

```
CLOUDFLARE_R2_ACCOUNT_ID
CLOUDFLARE_R2_ACCESS_KEY_ID
CLOUDFLARE_R2_SECRET_ACCESS_KEY
CLOUDFLARE_R2_BUCKET_NAME
CLOUDFLARE_R2_PUBLIC_URL   # e.g. https://pub-xxx.r2.dev or custom domain
```

### Key Structure

```
voice-memos/pending/{uuid}.{ext}      # temp key during upload
voice-memos/{workoutId}/{role}_{uuid}.{ext}  # permanent key after confirm
```

### R2 Client

New file: `lib/r2.ts` — exports a singleton `S3Client` configured for R2's S3-compatible endpoint (`https://{accountId}.r2.cloudflarestorage.com`).

### Lifecycle Rules

R2 bucket lifecycle rule: auto-delete objects under `voice-memos/pending/` after 24 hours to clean up orphaned uploads.

---

## Upload Flow

```
1. User records audio (WebM) or selects a file (MP3/M4A/WAV)
2. Client calls generateVoiceMemoPresignedUrl(workoutId, fileExtension)
   → Server validates auth + authorization for this workout
   → Returns { presignedUrl, pendingKey } (5-min expiry)
3. Browser PUTs file directly to R2 using presignedUrl
4. Client calls confirmVoiceMemoUpload(workoutId, pendingKey, durationSec)
   → Server copies object from pending/ to permanent key
   → Deletes pending object
   → Upserts VoiceMemo record (deletes old R2 object + DB record if replacing)
   → Triggers Pusher notification + Resend email
   → Returns saved VoiceMemo
5. UI shows VoiceMemoPlayer with the new memo
```

---

## Server Actions

### `lib/r2.ts`
Singleton S3Client for R2.

### `actions/voice-memo-actions.ts`

| Action | Description |
|---|---|
| `generateVoiceMemoPresignedUrl(workoutId, fileExtension)` | Validates auth, returns presigned PUT URL + pending key |
| `confirmVoiceMemoUpload(workoutId, pendingKey, durationSec)` | Finalizes upload, upserts DB record, triggers notifications |
| `deleteVoiceMemo(memoId)` | Deletes R2 object + DB record, only author can delete |
| `markVoiceMemoRead(memoId)` | Sets isRead=true, pushes Pusher event to clear badge |
| `getWorkoutVoiceMemos(workoutId)` | Returns trainer + client memos for a workout |
| `getTrainerVoiceMessageFeed(trainerId)` | Returns all client memos across trainer's clients, ordered by createdAt desc |

**Authorization rules:**
- Trainer: can generate presigned URL for any workout in their programs
- Client: can only generate presigned URL if workout belongs to their assigned program AND session is COMPLETED
- Any authorized party can read memos for workouts they have access to

**Validation:**
- `durationSec`: must be > 0 and <= 300
- `fileExtension`: must be one of `webm`, `mp3`, `m4a`, `wav`
- Presigned URL expiry: 5 minutes

---

## UI Components

### `components/voice-memo/VoiceMemoRecorder.tsx`

Shared by trainer and client. Renders:
- Mic button → starts `MediaRecorder` (WebM/Opus)
- Waveform animation during recording
- 5-minute countdown timer (auto-stops at 0)
- Stop + preview playback before submitting
- File picker fallback (`.mp3, .m4a, .wav`) for browsers without MediaRecorder
- Submit button → runs presign → PUT → confirm flow with progress indicator
- Graceful degradation: if `MediaRecorder` API unavailable, mic button hidden, file picker shown only

Props: `workoutId`, `role: VoiceMemoRole`, `onSuccess: (memo: VoiceMemo) => void`

### `components/voice-memo/VoiceMemoPlayer.tsx`

Compact audio player. Shows:
- Author name + role badge ("Trainer" or "You")
- Formatted duration (e.g. "1:32")
- Relative timestamp ("2 hours ago")
- Styled HTML5 `<audio>` element
- Calls `markVoiceMemoRead()` on first play

Props: `memo: VoiceMemo`, `authorName: string`

### `components/voice-memo/VoiceMessagesFeed.tsx`

Trainer-only inbox panel. Each row:
- Client name + avatar
- Workout name
- Unread dot (blue) if `isRead=false`
- "New response" or "Awaiting response" status label
- Relative timestamp
- Clicking row navigates to client's session page

Unread count badge on nav icon (sum of unread client memos across all clients). Badge updates in real time via Pusher channel `trainer-{trainerId}`.

---

## Placement in Existing UI

| Surface | Components Shown |
|---|---|
| Workout edit page (trainer, `/programs/[id]/edit`) | `VoiceMemoRecorder` + `VoiceMemoPlayer` if trainer memo exists |
| Workout completion screen (client) | `VoiceMemoPlayer` (trainer memo, if exists) + `VoiceMemoRecorder` prompt |
| Client session page — trainer view | `VoiceMemoPlayer` for trainer memo + `VoiceMemoPlayer` for client memo (side by side) |
| Main nav (trainer) | Voice Messages icon with unread count badge → `VoiceMessagesFeed` slide-out or page |

---

## Notifications

Both triggers fire inside `confirmVoiceMemoUpload()`:

### Trainer adds memo → client notified
- **Pusher:** channel `client-{clientId}`, event `voice-memo-added`, payload `{ workoutId, workoutName, trainerName }`
  - Client sees toast: *"[Trainer Name] left a voice note for [Workout Name]"*
- **Resend email:** to client — *"[Trainer Name] left you a voice note for [Workout Name]. Open the app to listen."*

### Client adds memo → trainer notified
- **Pusher:** channel `trainer-{trainerId}`, event `client-voice-memo-added`, payload `{ clientId, clientName, workoutId, workoutName }`
  - Increments unread badge on trainer's Voice Messages nav icon in real time
- **Resend email:** to trainer — *"[Client Name] completed [Workout Name] and left you a voice note."*

### Read receipts
- `markVoiceMemoRead(memoId)` fires Pusher event `voice-memo-read` on channel `trainer-{trainerId}` (the trainer's unread badge is the only real-time counter; client has no badge)
- Badge count decrements in real time without page reload

---

## UploadThing Removal

**Files to delete:**
- `lib/uploadthing.ts`
- `lib/uploadthing-client.ts`
- `app/api/uploadthing/route.ts`

**Packages to remove:**
- `uploadthing`
- `@uploadthing/next`

**UI to remove:**
- Exercise video upload fields in exercise creation/edit forms
- Exercise image upload fields
- Progress photo upload components
- Program brief upload
- Organization logo upload (replace with text/initials avatar or keep as-is)

**Prisma fields to keep:** `exerciseVideo`, `exerciseImage`, `progressPhoto` fields stay on their models for historical data integrity — just no new uploads.

---

## Error Handling

| Scenario | Handling |
|---|---|
| PUT to R2 succeeds, `confirmVoiceMemoUpload` fails | Pending object auto-deleted by R2 lifecycle rule after 24h |
| User re-records | Old R2 object deleted via stored `r2Key` before new record written |
| `durationSec > 300` | Recorder stops automatically at 5 min; server rejects if somehow bypassed |
| Browser lacks `MediaRecorder` | File picker shown; mic button hidden |
| R2 object not found during delete | Log warning, continue — DB record still deleted |
| Presigned URL expired (> 5 min) | R2 returns 403; UI shows error prompting user to retry |

---

## Out of Scope

- Text messaging or full chat system (designed to slot in later)
- Per-exercise voice memos (workout level only)
- Transcript/speech-to-text
- Memo threading or replies beyond one per role per workout
