# Voice Memos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bidirectional voice memos to workouts — trainers record coaching notes per workout, clients listen and respond on completion — with a Voice Messages inbox for trainers.

**Architecture:** Cloudflare R2 stores audio via presigned PUT URLs (bypassing the server); two server actions handle presigning and confirming uploads; three React components handle recording, playback, and the inbox feed; UploadThing is removed entirely and replaced with R2.

**Tech Stack:** Next.js App Router (server actions), Prisma 6 + MongoDB, Clerk auth, Cloudflare R2 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`), Pusher (real-time badges), Resend (email), Vitest (tests), shadcn/ui + Tailwind CSS 4

## Global Constraints

- MongoDB + Prisma 6: all IDs use `@id @default(auto()) @map("_id") @db.ObjectId`
- Server actions: always `"use server"`, call `auth()` from `@clerk/nextjs/server`, return `{ success: boolean; data?: T; error?: string }`
- Vitest mocks: mock `@clerk/nextjs/server`, `@/lib/prisma`, and `next/cache` at the top of every test file (see existing pattern in `actions/__tests__/program-workout-actions.test.ts`)
- Max audio duration: 300 seconds (5 minutes) — enforced client-side and server-side
- Allowed file extensions: `webm`, `mp3`, `m4a`, `wav`
- R2 key — pending: `voice-memos/pending/{uuid}.{ext}` — permanent: `voice-memos/{workoutId}/{role}_{uuid}.{ext}` where `{role}` is `trainer` or `client` (lowercase)
- `Program` model: `trainer User?` relation (named `"ProgramsCreated"`), `client User?` relation (named `"ProgramsAssigned"`)
- `User` model: `imageUrl String?` (not `avatarUrl`)

---

### Task 1: R2 Client + Package Installation

**Files:**
- Create: `lib/r2.ts`
- Modify: `package.json` (via npm install)

**Interfaces:**
- Produces: `getR2Client(): S3Client`, `R2_BUCKET_NAME: string`, `R2_PUBLIC_URL: string` — consumed by `actions/voice-memo-actions.ts`

- [ ] **Step 1: Install R2 AWS SDK packages**

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Expected: `added X packages`

- [ ] **Step 2: Create `lib/r2.ts`**

```typescript
import { S3Client } from "@aws-sdk/client-s3"

export const R2_BUCKET_NAME = process.env.CLOUDFLARE_R2_BUCKET_NAME!
export const R2_PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL!

let _r2: S3Client | null = null

export function getR2Client(): S3Client {
  if (!_r2) {
    _r2 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
      },
    })
  }
  return _r2
}
```

- [ ] **Step 3: Add environment variables to `.env.local`**

Append these lines (values to be filled in by developer from the Cloudflare R2 dashboard):

```
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=
CLOUDFLARE_R2_PUBLIC_URL=
```

- [ ] **Step 4: Verify TypeScript compiles with no errors from `lib/r2.ts`**

```bash
npx tsc --noEmit
```

Expected: exits 0

- [ ] **Step 5: Commit**

```bash
git add lib/r2.ts package.json package-lock.json
git commit -m "feat: add Cloudflare R2 client"
```

---

### Task 2: Prisma VoiceMemo Model

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `VoiceMemo` Prisma model, `VoiceMemoRole` enum — consumed by `actions/voice-memo-actions.ts`

- [ ] **Step 1: Add `VoiceMemoRole` enum to `prisma/schema.prisma`**

Find the enums section (after `enum SessionStatus`) and add:

```prisma
enum VoiceMemoRole {
  TRAINER
  CLIENT
}
```

- [ ] **Step 2: Add `VoiceMemo` model to `prisma/schema.prisma`**

Add after the `WorkoutSessionV2` model block:

```prisma
model VoiceMemo {
  id          String        @id @default(auto()) @map("_id") @db.ObjectId
  workoutId   String        @db.ObjectId
  workout     Workout       @relation(fields: [workoutId], references: [id], onDelete: Cascade)
  authorId    String
  authorRole  VoiceMemoRole
  r2Key       String
  r2Url       String
  durationSec Int
  isRead      Boolean       @default(false)
  createdAt   DateTime      @default(now())
}
```

- [ ] **Step 3: Add `voiceMemos` back-relation to the `Workout` model**

In the existing `Workout` model block, after `sessions WorkoutSessionV2[]`, add:

```prisma
  voiceMemos  VoiceMemo[]
```

- [ ] **Step 4: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add VoiceMemo Prisma model and VoiceMemoRole enum"
```

---

### Task 3: Validators

**Files:**
- Create: `lib/validators/voice-memo.ts`
- Create: `lib/validators/__tests__/voice-memo.test.ts`

**Interfaces:**
- Produces:
  - `presignSchema` — used in `generateVoiceMemoPresignedUrl`
  - `confirmSchema` — used in `confirmVoiceMemoUpload`
  - `PresignInput = z.infer<typeof presignSchema>`
  - `ConfirmInput = z.infer<typeof confirmSchema>`

- [ ] **Step 1: Write failing tests**

Create `lib/validators/__tests__/voice-memo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { presignSchema, confirmSchema } from '../voice-memo'

describe('presignSchema', () => {
  it('accepts all valid extensions', () => {
    for (const ext of ['webm', 'mp3', 'm4a', 'wav']) {
      expect(presignSchema.safeParse({ workoutId: 'abc', fileExtension: ext }).success).toBe(true)
    }
  })

  it('rejects invalid extension', () => {
    expect(presignSchema.safeParse({ workoutId: 'abc', fileExtension: 'mp4' }).success).toBe(false)
    expect(presignSchema.safeParse({ workoutId: 'abc', fileExtension: '' }).success).toBe(false)
  })

  it('rejects empty workoutId', () => {
    expect(presignSchema.safeParse({ workoutId: '', fileExtension: 'webm' }).success).toBe(false)
  })
})

describe('confirmSchema', () => {
  it('accepts valid input', () => {
    expect(
      confirmSchema.safeParse({ workoutId: 'abc', pendingKey: 'voice-memos/pending/x.webm', durationSec: 60 }).success
    ).toBe(true)
  })

  it('rejects durationSec > 300', () => {
    expect(
      confirmSchema.safeParse({ workoutId: 'abc', pendingKey: 'k', durationSec: 301 }).success
    ).toBe(false)
  })

  it('rejects durationSec <= 0', () => {
    expect(
      confirmSchema.safeParse({ workoutId: 'abc', pendingKey: 'k', durationSec: 0 }).success
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test lib/validators/__tests__/voice-memo.test.ts
```

Expected: FAIL — `Cannot find module '../voice-memo'`

- [ ] **Step 3: Create `lib/validators/voice-memo.ts`**

```typescript
import { z } from "zod"

const ALLOWED_EXTENSIONS = ["webm", "mp3", "m4a", "wav"] as const

export const presignSchema = z.object({
  workoutId: z.string().min(1),
  fileExtension: z.enum(ALLOWED_EXTENSIONS),
})

export const confirmSchema = z.object({
  workoutId: z.string().min(1),
  pendingKey: z.string().min(1),
  durationSec: z.number().int().min(1).max(300),
})

export type PresignInput = z.infer<typeof presignSchema>
export type ConfirmInput = z.infer<typeof confirmSchema>
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test lib/validators/__tests__/voice-memo.test.ts
```

Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add lib/validators/voice-memo.ts lib/validators/__tests__/voice-memo.test.ts
git commit -m "feat: add voice memo validators"
```

---

### Task 4: Voice Memo Server Actions

**Files:**
- Create: `actions/voice-memo-actions.ts`
- Create: `actions/__tests__/voice-memo-actions.test.ts`

**Interfaces:**
- Consumes: `getR2Client`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` from `lib/r2.ts`; `presignSchema`, `confirmSchema` from `lib/validators/voice-memo.ts`; `pusherServer` from `lib/pusher.ts`; `getResend` from `lib/email/resend.ts`; `VoiceMemoAddedEmail` from `lib/email/templates/voice-memo-added.tsx` (Task 5)
- Produces:
  - `generateVoiceMemoPresignedUrl(workoutId, fileExtension): Promise<{ success: boolean; data?: { presignedUrl: string; pendingKey: string }; error?: string }>`
  - `confirmVoiceMemoUpload(workoutId, pendingKey, durationSec): Promise<{ success: boolean; data?: VoiceMemoData; error?: string }>`
  - `deleteVoiceMemo(memoId): Promise<{ success: boolean; error?: string }>`
  - `markVoiceMemoRead(memoId): Promise<{ success: boolean; error?: string }>`
  - `getWorkoutVoiceMemos(workoutId): Promise<{ success: boolean; data?: { trainer: VoiceMemoData | null; client: VoiceMemoData | null }; error?: string }>`
  - `getTrainerVoiceMessageFeed(): Promise<{ success: boolean; data?: FeedItem[]; error?: string }>`
  - `export type VoiceMemoData` (exported)
  - `export type FeedItem` (exported)

- [ ] **Step 1: Write failing tests**

Create `actions/__tests__/voice-memo-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workout: { findUnique: vi.fn() },
    voiceMemo: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    program: { findMany: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  CopyObjectCommand: vi.fn(),
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }))
vi.mock('@/lib/r2', () => ({
  getR2Client: vi.fn(() => ({ send: vi.fn() })),
  R2_BUCKET_NAME: 'test-bucket',
  R2_PUBLIC_URL: 'https://pub.r2.dev',
}))
vi.mock('@/lib/pusher', () => ({ pusherServer: { trigger: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@/lib/email/resend', () => ({
  getResend: vi.fn(() => ({ emails: { send: vi.fn().mockResolvedValue({}) } })),
}))
vi.mock('@/lib/email/templates/voice-memo-added', () => ({ VoiceMemoAddedEmail: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  generateVoiceMemoPresignedUrl,
  confirmVoiceMemoUpload,
  markVoiceMemoRead,
} from '../voice-memo-actions'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockWorkoutFind = vi.mocked(prisma.workout.findUnique)
const mockMemoFindFirst = vi.mocked(prisma.voiceMemo.findFirst)
const mockMemoCreate = vi.mocked(prisma.voiceMemo.create)
const mockMemoUpdate = vi.mocked(prisma.voiceMemo.update)
const mockGetSignedUrl = vi.mocked(getSignedUrl)

const CLERK_ID = 'clerk_1'
const TRAINER_DB_ID = 'trainer_1'
const CLIENT_DB_ID = 'client_1'
const WORKOUT_ID = 'workout_1'
const PROGRAM_ID = 'program_1'

const dbTrainer = {
  id: TRAINER_DB_ID, clerkId: CLERK_ID, role: 'TRAINER',
  email: 'trainer@test.com', firstName: 'John', lastName: 'Doe',
}
const dbClient = {
  id: CLIENT_DB_ID, clerkId: CLERK_ID, role: 'CLIENT',
  email: 'client@test.com', firstName: 'Jane', lastName: 'Doe',
}
const workoutBase = {
  id: WORKOUT_ID, name: 'Push Day', programId: PROGRAM_ID,
  program: {
    id: PROGRAM_ID,
    trainerId: TRAINER_DB_ID,
    clientId: CLIENT_DB_ID,
    name: 'Plan A',
    trainer: { id: TRAINER_DB_ID, clerkId: CLERK_ID, email: 'trainer@test.com', firstName: 'John', lastName: 'Doe' },
    client: { id: CLIENT_DB_ID, clerkId: 'clerk_client', email: 'client@test.com', firstName: 'Jane', lastName: 'Doe' },
  },
  sessions: [],
}

beforeEach(() => vi.clearAllMocks())

describe('generateVoiceMemoPresignedUrl', () => {
  it('returns Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect(await generateVoiceMemoPresignedUrl(WORKOUT_ID, 'webm')).toEqual({
      success: false, error: 'Unauthorized',
    })
  })

  it('returns Unauthorized when user not in db', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(null)
    expect(await generateVoiceMemoPresignedUrl(WORKOUT_ID, 'webm')).toEqual({
      success: false, error: 'Unauthorized',
    })
  })

  it('returns Forbidden when trainer does not own workout', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue({
      ...workoutBase,
      program: { ...workoutBase.program, trainerId: 'other_trainer' },
    } as never)
    expect(await generateVoiceMemoPresignedUrl(WORKOUT_ID, 'webm')).toEqual({
      success: false, error: 'Forbidden',
    })
  })

  it('returns presigned URL for authorized trainer', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue(workoutBase as never)
    mockGetSignedUrl.mockResolvedValue('https://r2.example.com/presigned')
    const result = await generateVoiceMemoPresignedUrl(WORKOUT_ID, 'webm')
    expect(result.success).toBe(true)
    expect(result.data?.presignedUrl).toBe('https://r2.example.com/presigned')
    expect(result.data?.pendingKey).toMatch(/^voice-memos\/pending\/.+\.webm$/)
  })

  it('returns Forbidden when client has no COMPLETED session', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockWorkoutFind.mockResolvedValue({
      ...workoutBase,
      sessions: [{ clientId: CLIENT_DB_ID, status: 'IN_PROGRESS' }],
    } as never)
    expect(await generateVoiceMemoPresignedUrl(WORKOUT_ID, 'webm')).toEqual({
      success: false, error: 'Forbidden',
    })
  })

  it('allows client with COMPLETED session', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbClient as never)
    mockWorkoutFind.mockResolvedValue({
      ...workoutBase,
      sessions: [{ clientId: CLIENT_DB_ID, status: 'COMPLETED' }],
    } as never)
    mockGetSignedUrl.mockResolvedValue('https://r2.example.com/presigned')
    const result = await generateVoiceMemoPresignedUrl(WORKOUT_ID, 'webm')
    expect(result.success).toBe(true)
  })
})

describe('confirmVoiceMemoUpload', () => {
  it('creates a new VoiceMemo and returns it', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    mockWorkoutFind.mockResolvedValue(workoutBase as never)
    mockMemoFindFirst.mockResolvedValue(null)
    const savedMemo = {
      id: 'memo_1', workoutId: WORKOUT_ID, authorId: TRAINER_DB_ID,
      authorRole: 'TRAINER', r2Key: `voice-memos/${WORKOUT_ID}/trainer_uuid.webm`,
      r2Url: `https://pub.r2.dev/voice-memos/${WORKOUT_ID}/trainer_uuid.webm`,
      durationSec: 90, isRead: false, createdAt: new Date(),
    }
    mockMemoCreate.mockResolvedValue(savedMemo as never)
    const result = await confirmVoiceMemoUpload(WORKOUT_ID, 'voice-memos/pending/uuid.webm', 90)
    expect(result.success).toBe(true)
    expect(result.data?.authorRole).toBe('TRAINER')
    expect(result.data?.durationSec).toBe(90)
  })
})

describe('markVoiceMemoRead', () => {
  it('returns Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as never)
    expect(await markVoiceMemoRead('memo_1')).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('sets isRead to true', async () => {
    mockAuth.mockResolvedValue({ userId: CLERK_ID } as never)
    mockUserFind.mockResolvedValue(dbTrainer as never)
    vi.mocked(prisma.voiceMemo.findFirst).mockResolvedValue({
      id: 'memo_1', workoutId: WORKOUT_ID, isRead: false,
      workout: { program: { trainerId: TRAINER_DB_ID } },
    } as never)
    mockMemoUpdate.mockResolvedValue({ id: 'memo_1', isRead: true } as never)
    mockUserFind.mockResolvedValueOnce(dbTrainer as never).mockResolvedValueOnce({ clerkId: CLERK_ID } as never)
    const result = await markVoiceMemoRead('memo_1')
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test actions/__tests__/voice-memo-actions.test.ts
```

Expected: FAIL — `Cannot find module '../voice-memo-actions'`

- [ ] **Step 3: Create `actions/voice-memo-actions.ts`**

```typescript
"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { randomUUID } from "crypto"
import React from "react"
import {
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { prisma } from "@/lib/prisma"
import { getR2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2"
import { pusherServer } from "@/lib/pusher"
import { getResend } from "@/lib/email/resend"
import { VoiceMemoAddedEmail } from "@/lib/email/templates/voice-memo-added"
import { presignSchema, confirmSchema } from "@/lib/validators/voice-memo"

export type VoiceMemoData = {
  id: string
  workoutId: string
  authorId: string
  authorRole: "TRAINER" | "CLIENT"
  r2Key: string
  r2Url: string
  durationSec: number
  isRead: boolean
  createdAt: Date
}

export type FeedItem = {
  memoId: string
  clientClerkId: string
  clientName: string
  clientImageUrl: string | null
  workoutId: string
  workoutName: string
  sessionId: string
  isRead: boolean
  createdAt: Date
}

async function getAuthedUser() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function generateVoiceMemoPresignedUrl(
  workoutId: string,
  fileExtension: string
): Promise<{ success: boolean; data?: { presignedUrl: string; pendingKey: string }; error?: string }> {
  try {
    const parsed = presignSchema.safeParse({ workoutId, fileExtension })
    if (!parsed.success) return { success: false, error: "Invalid input" }

    const user = await getAuthedUser()
    if (!user) return { success: false, error: "Unauthorized" }

    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        program: { select: { id: true, trainerId: true, clientId: true } },
        sessions: { select: { clientId: true, status: true } },
      },
    })
    if (!workout) return { success: false, error: "Not found" }

    if (user.role === "TRAINER") {
      if (workout.program.trainerId !== user.id) return { success: false, error: "Forbidden" }
    } else {
      const completedSession = workout.sessions.find(
        (s) => s.clientId === user.id && s.status === "COMPLETED"
      )
      if (!completedSession) return { success: false, error: "Forbidden" }
    }

    const pendingKey = `voice-memos/pending/${randomUUID()}.${fileExtension}`
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: pendingKey,
      ContentType: `audio/${fileExtension === "webm" ? "webm" : fileExtension}`,
    })
    const presignedUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 300 })

    return { success: true, data: { presignedUrl, pendingKey } }
  } catch (err) {
    console.error("[voice-memo] presign error:", err)
    return { success: false, error: "Failed to generate upload URL" }
  }
}

export async function confirmVoiceMemoUpload(
  workoutId: string,
  pendingKey: string,
  durationSec: number
): Promise<{ success: boolean; data?: VoiceMemoData; error?: string }> {
  try {
    const parsed = confirmSchema.safeParse({ workoutId, pendingKey, durationSec })
    if (!parsed.success) return { success: false, error: "Invalid input" }

    const user = await getAuthedUser()
    if (!user) return { success: false, error: "Unauthorized" }

    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: {
        program: {
          include: {
            trainer: {
              select: { id: true, clerkId: true, email: true, firstName: true, lastName: true },
            },
            client: {
              select: { id: true, clerkId: true, email: true, firstName: true, lastName: true },
            },
          },
        },
        sessions: { select: { id: true, clientId: true, status: true } },
      },
    })
    if (!workout) return { success: false, error: "Not found" }

    const authorRole: "TRAINER" | "CLIENT" = user.role === "TRAINER" ? "TRAINER" : "CLIENT"

    if (authorRole === "TRAINER" && workout.program.trainerId !== user.id) {
      return { success: false, error: "Forbidden" }
    }
    if (authorRole === "CLIENT") {
      const completedSession = workout.sessions.find(
        (s) => s.clientId === user.id && s.status === "COMPLETED"
      )
      if (!completedSession) return { success: false, error: "Forbidden" }
    }

    // Move object from pending to permanent key
    const roleKey = authorRole.toLowerCase()
    const ext = pendingKey.split(".").pop()!
    const permanentKey = `voice-memos/${workoutId}/${roleKey}_${randomUUID()}.${ext}`

    await getR2Client().send(
      new CopyObjectCommand({
        Bucket: R2_BUCKET_NAME,
        CopySource: `${R2_BUCKET_NAME}/${pendingKey}`,
        Key: permanentKey,
      })
    )
    await getR2Client().send(
      new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: pendingKey })
    )

    // Replace any existing memo for this role
    const existing = await prisma.voiceMemo.findFirst({
      where: { workoutId, authorRole },
    })
    if (existing) {
      await getR2Client()
        .send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: existing.r2Key }))
        .catch((e) => console.warn("[r2] delete old memo:", e))
      await prisma.voiceMemo.delete({ where: { id: existing.id } })
    }

    const r2Url = `${R2_PUBLIC_URL}/${permanentKey}`
    const memo = await prisma.voiceMemo.create({
      data: {
        workoutId,
        authorId: user.id,
        authorRole,
        r2Key: permanentKey,
        r2Url,
        durationSec,
        isRead: false,
      },
    })

    // Fire notifications (non-blocking, fire-and-forget)
    const workoutName = workout.name
    if (authorRole === "TRAINER" && workout.program.client) {
      const trainerName = `${workout.program.trainer?.firstName ?? ""} ${workout.program.trainer?.lastName ?? ""}`.trim()
      const clientClerkId = workout.program.client.clerkId
      const completedSession = workout.sessions.find((s) => s.status === "COMPLETED")
      Promise.all([
        pusherServer
          .trigger(`client-${clientClerkId}`, "voice-memo-added", { workoutId, workoutName, trainerName })
          .catch((e) => console.error("[pusher] voice-memo-added:", e)),
        getResend().emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "noreply@inmotusrx.com",
          to: workout.program.client.email,
          subject: `${trainerName} left you a voice note`,
          react: React.createElement(VoiceMemoAddedEmail, {
            recipientName: `${workout.program.client.firstName} ${workout.program.client.lastName}`,
            senderName: trainerName,
            workoutName,
            sessionLink: `${process.env.NEXT_PUBLIC_APP_URL}/sessions/${completedSession?.id ?? ""}`,
            role: "client",
          }),
        }).catch((e) => console.error("[resend] voice-memo-added:", e)),
      ])
    } else if (authorRole === "CLIENT" && workout.program.trainer) {
      const clientName = `${user.firstName} ${user.lastName}`
      const trainerClerkId = workout.program.trainer.clerkId
      const completedSession = workout.sessions.find(
        (s) => s.clientId === user.id && s.status === "COMPLETED"
      )
      Promise.all([
        pusherServer
          .trigger(`trainer-${trainerClerkId}`, "client-voice-memo-added", {
            clientClerkId: user.clerkId,
            clientName,
            workoutId,
            workoutName,
          })
          .catch((e) => console.error("[pusher] client-voice-memo-added:", e)),
        getResend().emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "noreply@inmotusrx.com",
          to: workout.program.trainer.email,
          subject: `${clientName} left a voice note`,
          react: React.createElement(VoiceMemoAddedEmail, {
            recipientName: `${workout.program.trainer.firstName} ${workout.program.trainer.lastName}`,
            senderName: clientName,
            workoutName,
            sessionLink: `${process.env.NEXT_PUBLIC_APP_URL}/sessions/${completedSession?.id ?? ""}`,
            role: "trainer",
          }),
        }).catch((e) => console.error("[resend] client-voice-memo-added:", e)),
      ])
    }

    revalidatePath("/programs")
    revalidatePath("/sessions")

    return { success: true, data: memo as VoiceMemoData }
  } catch (err) {
    console.error("[voice-memo] confirm error:", err)
    return { success: false, error: "Failed to confirm upload" }
  }
}

export async function deleteVoiceMemo(
  memoId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { success: false, error: "Unauthorized" }

    const memo = await prisma.voiceMemo.findFirst({ where: { id: memoId, authorId: user.id } })
    if (!memo) return { success: false, error: "Not found" }

    await getR2Client()
      .send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: memo.r2Key }))
      .catch((e) => console.warn("[r2] delete memo:", e))

    await prisma.voiceMemo.delete({ where: { id: memoId } })
    return { success: true }
  } catch (err) {
    console.error("[voice-memo] delete error:", err)
    return { success: false, error: "Failed to delete" }
  }
}

export async function markVoiceMemoRead(
  memoId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthedUser()
    if (!user) return { success: false, error: "Unauthorized" }

    const memo = await prisma.voiceMemo.findFirst({
      where: { id: memoId },
      include: { workout: { include: { program: { select: { trainerId: true } } } } },
    })
    if (!memo) return { success: false, error: "Not found" }

    await prisma.voiceMemo.update({ where: { id: memoId }, data: { isRead: true } })

    const trainer = await prisma.user.findUnique({
      where: { id: memo.workout.program.trainerId ?? "" },
      select: { clerkId: true },
    })
    if (trainer) {
      pusherServer
        .trigger(`trainer-${trainer.clerkId}`, "voice-memo-read", { memoId })
        .catch((e) => console.error("[pusher] voice-memo-read:", e))
    }

    return { success: true }
  } catch (err) {
    console.error("[voice-memo] markRead error:", err)
    return { success: false, error: "Failed to mark as read" }
  }
}

export async function getWorkoutVoiceMemos(workoutId: string): Promise<{
  success: boolean
  data?: { trainer: VoiceMemoData | null; client: VoiceMemoData | null }
  error?: string
}> {
  try {
    const user = await getAuthedUser()
    if (!user) return { success: false, error: "Unauthorized" }

    const memos = await prisma.voiceMemo.findMany({
      where: { workoutId },
      orderBy: { createdAt: "desc" },
    })

    const trainer = (memos.find((m) => m.authorRole === "TRAINER") ?? null) as VoiceMemoData | null
    const client = (memos.find((m) => m.authorRole === "CLIENT") ?? null) as VoiceMemoData | null

    return { success: true, data: { trainer, client } }
  } catch (err) {
    console.error("[voice-memo] getWorkoutMemos error:", err)
    return { success: false, error: "Failed to fetch memos" }
  }
}

export async function getTrainerVoiceMessageFeed(): Promise<{
  success: boolean
  data?: FeedItem[]
  error?: string
}> {
  try {
    const user = await getAuthedUser()
    if (!user || user.role !== "TRAINER") return { success: false, error: "Unauthorized" }

    const programs = await prisma.program.findMany({
      where: { trainerId: user.id, clientId: { not: null } },
      include: {
        client: {
          select: { id: true, clerkId: true, firstName: true, lastName: true, imageUrl: true },
        },
        workouts: {
          include: {
            voiceMemos: {
              where: { authorRole: "CLIENT" },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            sessions: {
              where: { status: "COMPLETED" },
              orderBy: { completedAt: "desc" },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    })

    const feed: FeedItem[] = []
    for (const program of programs) {
      if (!program.client) continue
      const clientName = `${program.client.firstName} ${program.client.lastName}`
      for (const workout of program.workouts) {
        const memo = workout.voiceMemos[0]
        if (!memo) continue
        const session = workout.sessions[0]
        feed.push({
          memoId: memo.id,
          clientClerkId: program.client.clerkId,
          clientName,
          clientImageUrl: program.client.imageUrl ?? null,
          workoutId: workout.id,
          workoutName: workout.name,
          sessionId: session?.id ?? "",
          isRead: memo.isRead,
          createdAt: memo.createdAt,
        })
      }
    }

    feed.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return { success: true, data: feed }
  } catch (err) {
    console.error("[voice-memo] feed error:", err)
    return { success: false, error: "Failed to fetch feed" }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test actions/__tests__/voice-memo-actions.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/voice-memo-actions.ts actions/__tests__/voice-memo-actions.test.ts
git commit -m "feat: add voice memo server actions"
```

---

### Task 5: Email Template

**Files:**
- Create: `lib/email/templates/voice-memo-added.tsx`

**Interfaces:**
- Produces: `VoiceMemoAddedEmail` React component — consumed by `actions/voice-memo-actions.ts`

Props:
```typescript
{
  recipientName: string
  senderName: string
  workoutName: string
  sessionLink: string
  role: "trainer" | "client"
}
```

- [ ] **Step 1: Create `lib/email/templates/voice-memo-added.tsx`**

```tsx
import * as React from "react"

interface VoiceMemoAddedEmailProps {
  recipientName: string
  senderName: string
  workoutName: string
  sessionLink: string
  role: "trainer" | "client"
}

export function VoiceMemoAddedEmail({
  recipientName,
  senderName,
  workoutName,
  sessionLink,
  role,
}: VoiceMemoAddedEmailProps) {
  const subject =
    role === "client"
      ? `${senderName} left you a voice note`
      : `${senderName} left a voice note`
  const body =
    role === "client"
      ? `Your trainer <strong>${senderName}</strong> recorded a coaching note for <strong>${workoutName}</strong>. Open the app to listen before your session.`
      : `Your client <strong>${senderName}</strong> completed <strong>${workoutName}</strong> and left you a voice response.`
  const ctaLabel = role === "client" ? "Listen to Voice Note" : "View Client Response"

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{subject}</title>
      </head>
      <body style={styles.body}>
        <table width="100%" cellPadding={0} cellSpacing={0} style={styles.outerTable}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "40px 16px" }}>
                <table width="100%" cellPadding={0} cellSpacing={0} style={styles.card}>
                  <tbody>
                    <tr>
                      <td style={styles.headerBar}>
                        <p style={styles.brandName}>INMOTUS RX</p>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.bodyPad}>
                        <p style={styles.greeting}>Hi {recipientName},</p>
                        <p
                          style={styles.intro}
                          dangerouslySetInnerHTML={{ __html: body }}
                        />
                        <table
                          width="100%"
                          cellPadding={0}
                          cellSpacing={0}
                          style={{ marginTop: 28, textAlign: "center" }}
                        >
                          <tbody>
                            <tr>
                              <td align="center">
                                <a href={sessionLink} style={styles.ctaButton}>
                                  {ctaLabel}
                                </a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p style={styles.footnote}>
                          You received this because you are part of this training program.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.footer}>
                        <p style={styles.footerText}>
                          &copy; {new Date().getFullYear()} INMOTUS RX. All rights reserved.
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    backgroundColor: "#f4f6f9",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: 0,
    padding: 0,
  },
  outerTable: { backgroundColor: "#f4f6f9", maxWidth: "600px", margin: "0 auto" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    maxWidth: "560px",
    width: "100%",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  headerBar: { backgroundColor: "#16a34a", padding: "24px 32px" },
  brandName: { color: "#ffffff", fontSize: "18px", fontWeight: 700, margin: 0 },
  bodyPad: { padding: "32px" },
  greeting: { color: "#111827", fontSize: "20px", fontWeight: 600, margin: "0 0 12px 0" },
  intro: { color: "#4b5563", fontSize: "15px", lineHeight: "1.6", margin: "0 0 24px 0" },
  ctaButton: {
    backgroundColor: "#16a34a",
    borderRadius: "8px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: 600,
    padding: "12px 28px",
    textDecoration: "none",
  },
  footnote: { color: "#9ca3af", fontSize: "13px", lineHeight: "1.5", marginTop: "28px", marginBottom: 0 },
  footer: { backgroundColor: "#f9fafb", borderTop: "1px solid #e5e7eb", padding: "20px 32px" },
  footerText: { color: "#9ca3af", fontSize: "12px", margin: "0 0 4px 0" },
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0

- [ ] **Step 3: Commit**

```bash
git add lib/email/templates/voice-memo-added.tsx
git commit -m "feat: add voice memo email template"
```

---

### Task 6: VoiceMemoPlayer Component

**Files:**
- Create: `components/voice-memo/VoiceMemoPlayer.tsx`

**Interfaces:**
- Consumes: `VoiceMemoData` from `actions/voice-memo-actions.ts`; `markVoiceMemoRead` from `actions/voice-memo-actions.ts`
- Produces: `<VoiceMemoPlayer memo={VoiceMemoData} authorName={string} />` — consumed by Tasks 9, 10, 11

- [ ] **Step 1: Create `components/voice-memo/VoiceMemoPlayer.tsx`**

```tsx
"use client"

import { useRef, useState, useEffect } from "react"
import { Play, Pause, Mic, User } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { markVoiceMemoRead } from "@/actions/voice-memo-actions"
import type { VoiceMemoData } from "@/actions/voice-memo-actions"

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function formatRelative(date: Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface VoiceMemoPlayerProps {
  memo: VoiceMemoData
  authorName: string
}

export function VoiceMemoPlayer({ memo, authorName }: VoiceMemoPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [hasPlayed, setHasPlayed] = useState(memo.isRead)
  const isTrainer = memo.authorRole === "TRAINER"

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTimeUpdate = () =>
      setProgress((audio.currentTime / (audio.duration || 1)) * 100)
    const onEnded = () => setPlaying(false)
    audio.addEventListener("timeupdate", onTimeUpdate)
    audio.addEventListener("ended", onEnded)
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate)
      audio.removeEventListener("ended", onEnded)
    }
  }, [])

  async function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      await audio.play()
      setPlaying(true)
      if (!hasPlayed) {
        setHasPlayed(true)
        markVoiceMemoRead(memo.id).catch(() => {})
      }
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isTrainer ? "bg-emerald-100" : "bg-blue-100"
        }`}
      >
        {isTrainer ? (
          <Mic className="h-4 w-4 text-emerald-600" />
        ) : (
          <User className="h-4 w-4 text-blue-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{authorName}</span>
          <Badge
            variant="outline"
            className={`px-1.5 py-0 text-[10px] ${
              isTrainer
                ? "border-emerald-200 text-emerald-700"
                : "border-blue-200 text-blue-700"
            }`}
          >
            {isTrainer ? "Trainer" : "Client"}
          </Badge>
          {!hasPlayed && (
            <span className="h-2 w-2 rounded-full bg-blue-500" />
          )}
        </div>
        <div
          className="mt-1.5 h-1.5 w-full cursor-pointer rounded-full bg-muted"
          onClick={seek}
        >
          <div
            className={`h-full rounded-full transition-all ${
              isTrainer ? "bg-emerald-500" : "bg-blue-500"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {formatDuration(memo.durationSec)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatRelative(memo.createdAt)}
          </span>
        </div>
      </div>
      <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={togglePlay}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <audio ref={audioRef} src={memo.r2Url} preload="metadata" />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0

- [ ] **Step 3: Commit**

```bash
git add components/voice-memo/VoiceMemoPlayer.tsx
git commit -m "feat: add VoiceMemoPlayer component"
```

---

### Task 7: VoiceMemoRecorder Component

**Files:**
- Create: `hooks/use-voice-memo-upload.ts`
- Create: `components/voice-memo/VoiceMemoRecorder.tsx`

**Interfaces:**
- Consumes: `generateVoiceMemoPresignedUrl`, `confirmVoiceMemoUpload`, `VoiceMemoData` from `actions/voice-memo-actions.ts`
- Produces:
  - `useVoiceMemoUpload()` hook (from `hooks/use-voice-memo-upload.ts`)
  - `<VoiceMemoRecorder workoutId={string} role={"TRAINER"|"CLIENT"} onSuccess={(memo: VoiceMemoData) => void} existingMemo?: VoiceMemoData />` — consumed by Tasks 9, 10

- [ ] **Step 1: Create `hooks/use-voice-memo-upload.ts`**

```typescript
import { useState } from "react"
import {
  generateVoiceMemoPresignedUrl,
  confirmVoiceMemoUpload,
} from "@/actions/voice-memo-actions"
import type { VoiceMemoData } from "@/actions/voice-memo-actions"

export type UploadState = "idle" | "uploading" | "confirming" | "done" | "error"

export function useVoiceMemoUpload() {
  const [uploadState, setUploadState] = useState<UploadState>("idle")
  const [error, setError] = useState<string | null>(null)

  async function upload(
    workoutId: string,
    audioBlob: Blob,
    fileExtension: string,
    durationSec: number
  ): Promise<VoiceMemoData | null> {
    setUploadState("uploading")
    setError(null)
    try {
      const presignResult = await generateVoiceMemoPresignedUrl(workoutId, fileExtension)
      if (!presignResult.success || !presignResult.data) {
        setError(presignResult.error ?? "Failed to get upload URL")
        setUploadState("error")
        return null
      }
      const { presignedUrl, pendingKey } = presignResult.data

      const uploadResp = await fetch(presignedUrl, {
        method: "PUT",
        body: audioBlob,
        headers: { "Content-Type": audioBlob.type || `audio/${fileExtension}` },
      })
      if (!uploadResp.ok) {
        setError("Upload to storage failed. Please try again.")
        setUploadState("error")
        return null
      }

      setUploadState("confirming")
      const confirmResult = await confirmVoiceMemoUpload(workoutId, pendingKey, durationSec)
      if (!confirmResult.success || !confirmResult.data) {
        setError(confirmResult.error ?? "Failed to confirm upload")
        setUploadState("error")
        return null
      }

      setUploadState("done")
      return confirmResult.data
    } catch (err) {
      console.error("[useVoiceMemoUpload]", err)
      setError("Upload failed. Please try again.")
      setUploadState("error")
      return null
    }
  }

  function reset() {
    setUploadState("idle")
    setError(null)
  }

  return { upload, uploadState, error, reset }
}
```

- [ ] **Step 2: Create `components/voice-memo/VoiceMemoRecorder.tsx`**

```tsx
"use client"

import { useRef, useState, useEffect } from "react"
import { Mic, Square, Upload, Send, RotateCcw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useVoiceMemoUpload } from "@/hooks/use-voice-memo-upload"
import type { VoiceMemoData } from "@/actions/voice-memo-actions"

const MAX_DURATION_SEC = 300

interface VoiceMemoRecorderProps {
  workoutId: string
  role: "TRAINER" | "CLIENT"
  onSuccess: (memo: VoiceMemoData) => void
  existingMemo?: VoiceMemoData
}

export function VoiceMemoRecorder({
  workoutId,
  role,
  onSuccess,
  existingMemo,
}: VoiceMemoRecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [supportsRecording] = useState(
    () => typeof window !== "undefined" && !!window.MediaRecorder
  )
  const [recording, setRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [fileExtension, setFileExtension] = useState("webm")

  const { upload, uploadState, error, reset: resetUpload } = useVoiceMemoUpload()
  const uploading = uploadState === "uploading" || uploadState === "confirming"
  const isClient = role === "CLIENT"

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" })
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setFileExtension("webm")
      }
      mr.start(1000)
      mediaRecorderRef.current = mr
      setRecording(true)
      setElapsed(0)
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev + 1 >= MAX_DURATION_SEC) {
            stopRecording()
            return MAX_DURATION_SEC
          }
          return prev + 1
        })
      }, 1000)
    } catch {
      toast.error("Microphone access denied. Allow microphone permissions and try again.")
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp3"
    if (!["mp3", "m4a", "wav", "webm"].includes(ext)) {
      toast.error("Please select an MP3, M4A, WAV, or WebM file.")
      return
    }
    setAudioBlob(file)
    setAudioUrl(URL.createObjectURL(file))
    setFileExtension(ext)
    setSelectedFileName(file.name)
    setElapsed(0)
  }

  function discard() {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setElapsed(0)
    setSelectedFileName(null)
    resetUpload()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function submit() {
    if (!audioBlob) return
    // For file uploads, estimate duration from file size (rough: ~16kbps)
    const durationSec = elapsed > 0 ? elapsed : Math.max(1, Math.round(audioBlob.size / 2000))
    const memo = await upload(
      workoutId,
      audioBlob,
      fileExtension,
      Math.min(durationSec, MAX_DURATION_SEC)
    )
    if (memo) {
      toast.success("Voice note sent!")
      onSuccess(memo)
      discard()
    } else {
      toast.error(error ?? "Upload failed. Please try again.")
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full ${
            isClient ? "bg-blue-100" : "bg-emerald-100"
          }`}
        >
          <Mic className={`h-4 w-4 ${isClient ? "text-blue-600" : "text-emerald-600"}`} />
        </div>
        <span className="text-sm font-semibold">
          {existingMemo ? "Replace voice note" : "Add voice note"}
        </span>
      </div>

      {!audioBlob && !recording && (
        <div className="flex flex-wrap gap-2">
          {supportsRecording && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={startRecording}
            >
              <Mic className="h-3.5 w-3.5" />
              Record
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.m4a,.wav,.webm"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      )}

      {recording && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className="flex-1 text-sm font-medium text-red-700">
            Recording… {formatTime(elapsed)}
          </span>
          <span className="text-xs text-red-500">
            {formatTime(MAX_DURATION_SEC - elapsed)} left
          </span>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 gap-1 text-xs"
            onClick={stopRecording}
          >
            <Square className="h-3 w-3" />
            Stop
          </Button>
        </div>
      )}

      {audioBlob && !recording && (
        <div className="space-y-2.5">
          {selectedFileName && (
            <p className="truncate text-xs text-muted-foreground">{selectedFileName}</p>
          )}
          <audio src={audioUrl ?? undefined} controls className="h-9 w-full rounded-lg" />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={discard}
              disabled={uploading}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Discard
            </Button>
            <Button
              size="sm"
              className={`flex-1 gap-1.5 border-0 text-white ${
                isClient
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
              onClick={submit}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {uploading ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0

- [ ] **Step 4: Commit**

```bash
git add hooks/use-voice-memo-upload.ts components/voice-memo/VoiceMemoRecorder.tsx
git commit -m "feat: add VoiceMemoRecorder and useVoiceMemoUpload hook"
```

---

### Task 8: VoiceMessagesFeed + Page

**Files:**
- Create: `components/voice-memo/VoiceMessagesFeed.tsx`
- Create: `app/(platform)/voice-messages/page.tsx`

**Interfaces:**
- Consumes: `getTrainerVoiceMessageFeed`, `FeedItem` from `actions/voice-memo-actions.ts`
- Produces: trainer-only `/voice-messages` page

- [ ] **Step 1: Create `components/voice-memo/VoiceMessagesFeed.tsx`**

```tsx
"use client"

import { useRouter } from "next/navigation"
import { Mic, CheckCircle2, Clock } from "lucide-react"
import type { FeedItem } from "@/actions/voice-memo-actions"

function formatRelative(date: Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(" ")
  const letters =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : name.slice(0, 2)
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white">
      {letters.toUpperCase()}
    </div>
  )
}

export function VoiceMessagesFeed({ items }: { items: FeedItem[] }) {
  const router = useRouter()

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Mic className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No voice messages yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Client responses appear here after they complete a workout
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/60">
      {items.map((item) => (
        <button
          key={item.memoId}
          type="button"
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50"
          onClick={() => router.push(`/sessions/${item.sessionId}`)}
        >
          <Initials name={item.clientName} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{item.clientName}</span>
              {!item.isRead && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {item.workoutName}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-[11px] text-muted-foreground">
              {formatRelative(item.createdAt)}
            </span>
            {item.isRead ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Clock className="h-3.5 w-3.5 text-blue-500" />
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(platform)/voice-messages/page.tsx`**

```tsx
import { requireRole } from "@/lib/current-user"
import { getTrainerVoiceMessageFeed } from "@/actions/voice-memo-actions"
import { VoiceMessagesFeed } from "@/components/voice-memo/VoiceMessagesFeed"
import { Mic } from "lucide-react"

export default async function VoiceMessagesPage() {
  await requireRole("TRAINER")
  const result = await getTrainerVoiceMessageFeed()
  const items = result.data ?? []
  const unreadCount = items.filter((i) => !i.isRead).length

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
          <Mic className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Voice Messages</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <VoiceMessagesFeed items={items} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0

- [ ] **Step 4: Commit**

```bash
git add components/voice-memo/VoiceMessagesFeed.tsx "app/(platform)/voice-messages/page.tsx"
git commit -m "feat: add VoiceMessagesFeed and voice-messages page"
```

---

### Task 9: Integrate VoiceMemo into Program Schedule View (Trainer)

**Files:**
- Modify: `components/programs/program-schedule-view.tsx`

**Interfaces:**
- Consumes: `VoiceMemoRecorder`, `VoiceMemoPlayer`, `getWorkoutVoiceMemos`, `VoiceMemoData`

The schedule view renders a grid of workout cards, each with a `workout.id: string` that maps to the Prisma `Workout.id`. Add a collapsible voice memo section to each workout card.

- [ ] **Step 1: Confirm `"use client"` is declared at the top of `program-schedule-view.tsx`**

Open the file and check line 1. If missing, add it.

- [ ] **Step 2: Add imports to `components/programs/program-schedule-view.tsx`**

Add these imports near the top alongside existing imports:

```typescript
import { useState } from "react"  // only if not already imported
import { VoiceMemoRecorder } from "@/components/voice-memo/VoiceMemoRecorder"
import { VoiceMemoPlayer } from "@/components/voice-memo/VoiceMemoPlayer"
import { getWorkoutVoiceMemos } from "@/actions/voice-memo-actions"
import type { VoiceMemoData } from "@/actions/voice-memo-actions"
import { Mic } from "lucide-react"  // only if not already imported
```

- [ ] **Step 3: Add `WorkoutVoiceMemoSection` component to the file**

Add this component definition in the file, after the helper functions (e.g. after `formatPrescription`) and before the main exported component:

```tsx
function WorkoutVoiceMemoSection({
  workoutId,
  trainerName,
}: {
  workoutId: string
  trainerName: string
}) {
  const [trainerMemo, setTrainerMemo] = useState<VoiceMemoData | null | undefined>(undefined)
  const [open, setOpen] = useState(false)

  async function openAndLoad() {
    setOpen(true)
    if (trainerMemo === undefined) {
      const result = await getWorkoutVoiceMemos(workoutId)
      setTrainerMemo(result.data?.trainer ?? null)
    }
  }

  return (
    <div className="border-t border-border/40 px-3 py-2.5">
      {!open ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={openAndLoad}
        >
          <Mic className="h-3 w-3" />
          {trainerMemo ? "View voice note" : "Add voice note"}
        </Button>
      ) : (
        <div className="space-y-2">
          {trainerMemo && (
            <VoiceMemoPlayer memo={trainerMemo} authorName={trainerName} />
          )}
          <VoiceMemoRecorder
            workoutId={workoutId}
            role="TRAINER"
            onSuccess={(memo) => setTrainerMemo(memo)}
            existingMemo={trainerMemo ?? undefined}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Mount `WorkoutVoiceMemoSection` inside each workout card**

In the schedule view, find where `workout.name` is rendered inside a card (search for `workout.name`). Workout cards have access to `workout.id`.

Just before the closing tag of each workout card, add:

```tsx
<WorkoutVoiceMemoSection
  workoutId={workout.id}
  trainerName={trainerName}
/>
```

`trainerName` is either already a prop of `ProgramScheduleView` or can be derived from the program data already passed to the component. Trace the props and pass `trainerName: string` from the parent if needed. The parent page at `app/(platform)/programs/[id]/edit/page.tsx` has access to the current user's name via Clerk.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0

- [ ] **Step 6: Commit**

```bash
git add components/programs/program-schedule-view.tsx
git commit -m "feat: add voice memo section to workout cards in schedule view"
```

---

### Task 10: Integrate VoiceMemo into Session Completion Dialogs (Client)

**Files:**
- Modify: `components/workout/workout-session-tracker.tsx`
- Modify: `components/workout/workout-checklist-tracker.tsx`

**Interfaces:**
- Consumes: `VoiceMemoPlayer`, `VoiceMemoRecorder`, `getWorkoutVoiceMemos`, `VoiceMemoData`

The completion dialog in `workout-session-tracker.tsx` is at `<Dialog open={showEndDialog}>` (line ~729). After the notes `<Textarea>` and before `<DialogFooter>`, add the voice memo section.

The checklist tracker calls `handleFinish()` directly without a dialog. In this task, add a `showEndDialog` gate: clicking "Complete Session" opens a dialog first (same content as the session tracker's completion dialog), and `handleFinish` is called only from inside that dialog.

- [ ] **Step 1: Add imports to `workout-session-tracker.tsx`**

```typescript
import { VoiceMemoPlayer } from "@/components/voice-memo/VoiceMemoPlayer"
import { VoiceMemoRecorder } from "@/components/voice-memo/VoiceMemoRecorder"
import { getWorkoutVoiceMemos } from "@/actions/voice-memo-actions"
import type { VoiceMemoData } from "@/actions/voice-memo-actions"
```

- [ ] **Step 2: Add voice memo state to `WorkoutSessionTracker`**

Inside the component function, alongside other `useState` calls:

```typescript
const [trainerMemo, setTrainerMemo] = useState<VoiceMemoData | null>(null)
const [clientMemo, setClientMemo] = useState<VoiceMemoData | null>(null)
const [memosLoaded, setMemosLoaded] = useState(false)
```

- [ ] **Step 3: Load memos when the end dialog opens in `workout-session-tracker.tsx`**

Add this `useEffect` after the existing `useEffect` blocks:

```typescript
useEffect(() => {
  if (!showEndDialog || memosLoaded) return
  getWorkoutVoiceMemos(session.workout.id).then((result) => {
    if (result.success && result.data) {
      setTrainerMemo(result.data.trainer)
      setClientMemo(result.data.client)
    }
    setMemosLoaded(true)
  })
}, [showEndDialog, memosLoaded, session.workout.id])
```

- [ ] **Step 4: Add voice memo UI inside the completion dialog in `workout-session-tracker.tsx`**

Find the `<div className="space-y-5 py-2">` inside the completion `<Dialog>`. After the notes `<Textarea>` section, add:

```tsx
{trainerMemo && (
  <div className="space-y-1.5">
    <p className="text-sm font-semibold">Trainer Voice Note</p>
    <VoiceMemoPlayer memo={trainerMemo} authorName="Your Trainer" />
  </div>
)}
{!clientMemo ? (
  <div className="space-y-1.5">
    <p className="text-sm font-semibold">
      Leave a voice note{" "}
      <span className="font-normal text-muted-foreground">(optional)</span>
    </p>
    <VoiceMemoRecorder
      workoutId={session.workout.id}
      role="CLIENT"
      onSuccess={(memo) => setClientMemo(memo)}
    />
  </div>
) : (
  <p className="text-sm font-semibold text-emerald-700">Voice note sent ✓</p>
)}
```

- [ ] **Step 5: Apply same changes to `workout-checklist-tracker.tsx`**

Add the same imports at the top:

```typescript
import { VoiceMemoPlayer } from "@/components/voice-memo/VoiceMemoPlayer"
import { VoiceMemoRecorder } from "@/components/voice-memo/VoiceMemoRecorder"
import { getWorkoutVoiceMemos } from "@/actions/voice-memo-actions"
import type { VoiceMemoData } from "@/actions/voice-memo-actions"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Trophy, Loader2, Check } from "lucide-react"
```

Add state variables inside the `WorkoutChecklistTracker` component (alongside existing state):

```typescript
const [showEndDialog, setShowEndDialog] = useState(false)
const [rpe, setRpe] = useState(5)
const [notes, setNotes] = useState("")
const [trainerMemo, setTrainerMemo] = useState<VoiceMemoData | null>(null)
const [clientMemo, setClientMemo] = useState<VoiceMemoData | null>(null)
const [memosLoaded, setMemosLoaded] = useState(false)
```

Add the memos `useEffect`:

```typescript
useEffect(() => {
  if (!showEndDialog || memosLoaded) return
  getWorkoutVoiceMemos(session.workout.id).then((result) => {
    if (result.success && result.data) {
      setTrainerMemo(result.data.trainer)
      setClientMemo(result.data.client)
    }
    setMemosLoaded(true)
  })
}, [showEndDialog, memosLoaded, session.workout.id])
```

Change the "Complete Session" `onClick` from calling `handleFinish` directly to opening the dialog:

```tsx
// Before:
onClick={handleFinish}
// After:
onClick={() => setShowEndDialog(true)}
```

Add the dialog at the end of the component's return JSX (before the closing `</div>`):

```tsx
<Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25">
        <Trophy className="h-8 w-8 text-white" />
      </div>
      <DialogTitle className="text-center text-xl">Great work!</DialogTitle>
    </DialogHeader>
    <div className="space-y-5 py-2">
      <div>
        <Label className="font-semibold">
          How hard was this session?{" "}
          <span className="font-normal text-muted-foreground">RPE {rpe}/10</span>
        </Label>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Easy</span>
          <input
            type="range"
            min={0}
            max={10}
            value={rpe}
            onChange={(e) => setRpe(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-xs text-muted-foreground">Max</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="font-semibold">
          Session Notes{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          placeholder="How did it feel?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="resize-none"
        />
      </div>
      {trainerMemo && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Trainer Voice Note</p>
          <VoiceMemoPlayer memo={trainerMemo} authorName="Your Trainer" />
        </div>
      )}
      {!clientMemo ? (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">
            Leave a voice note{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          <VoiceMemoRecorder
            workoutId={session.workout.id}
            role="CLIENT"
            onSuccess={(memo) => setClientMemo(memo)}
          />
        </div>
      ) : (
        <p className="text-sm font-semibold text-emerald-700">Voice note sent ✓</p>
      )}
    </div>
    <DialogFooter className="gap-2">
      <Button variant="outline" onClick={() => setShowEndDialog(false)}>
        Back
      </Button>
      <Button
        className="flex-1 border-0 bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600"
        onClick={handleFinish}
        disabled={isCompleting}
      >
        {isCompleting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Check className="mr-2 h-4 w-4" />
        )}
        Complete Session
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Note: `isCompleting` should already exist in the checklist tracker (`const [isCompleting, setIsCompleting] = useState(false)`) — check and add if missing.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0

- [ ] **Step 7: Commit**

```bash
git add components/workout/workout-session-tracker.tsx components/workout/workout-checklist-tracker.tsx
git commit -m "feat: add voice memos to session completion dialogs"
```

---

### Task 11: Show Voice Memos on Session Page (Trainer View)

**Files:**
- Modify: `app/(platform)/sessions/[id]/page.tsx`

**Interfaces:**
- Consumes: `getWorkoutVoiceMemos`, `VoiceMemoPlayer`, `VoiceMemoData`

- [ ] **Step 1: Add imports to `app/(platform)/sessions/[id]/page.tsx`**

```typescript
import { getWorkoutVoiceMemos } from "@/actions/voice-memo-actions"
import { VoiceMemoPlayer } from "@/components/voice-memo/VoiceMemoPlayer"
```

- [ ] **Step 2: Fetch voice memos after the session fetch**

After the `prisma.workoutSessionV2.findUnique(...)` call (which already fetches the session), add:

```typescript
const voiceMemoResult = await getWorkoutVoiceMemos(session.workoutId)
const trainerMemo = voiceMemoResult.data?.trainer ?? null
const clientMemo = voiceMemoResult.data?.client ?? null
```

- [ ] **Step 3: Extend the existing Prisma query to include trainer name**

In the `prisma.workoutSessionV2.findUnique(...)` call, find the `include` for `workout.program` and add the trainer relation:

```typescript
program: {
  include: {
    trainer: { select: { firstName: true, lastName: true } },
    // keep any other existing includes
  },
},
```

Also ensure `client: { select: { firstName: true, lastName: true } }` is included at the session level for the client name. If it is not present, add it to the `include`.

- [ ] **Step 4: Add voice memo section to the page JSX**

After the back button `<div>` and before `<WorkoutModeWrapper>`, add:

```tsx
{(trainerMemo || clientMemo) && (
  <div className="mb-4 space-y-2 rounded-2xl border border-border/60 bg-card px-4 py-4 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      Voice Notes
    </p>
    {trainerMemo && (
      <VoiceMemoPlayer
        memo={trainerMemo}
        authorName={
          [
            session.workout.program.trainer?.firstName,
            session.workout.program.trainer?.lastName,
          ]
            .filter(Boolean)
            .join(" ") || "Trainer"
        }
      />
    )}
    {clientMemo && (
      <VoiceMemoPlayer
        memo={clientMemo}
        authorName={
          [session.client?.firstName, session.client?.lastName]
            .filter(Boolean)
            .join(" ") || "Client"
        }
      />
    )}
  </div>
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0

- [ ] **Step 6: Commit**

```bash
git add "app/(platform)/sessions/[id]/page.tsx"
git commit -m "feat: show voice memos on session page"
```

---

### Task 12: Voice Messages Nav Item + Unread Badge

**Files:**
- Create: `components/voice-memo/VoiceMessagesNavBadge.tsx`
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/mobile-nav.tsx`

**Interfaces:**
- Consumes: `pusher-js`; `getTrainerVoiceMessageFeed`; `FeedItem`

- [ ] **Step 1: Create `components/voice-memo/VoiceMessagesNavBadge.tsx`**

```tsx
"use client"

import { useEffect, useState } from "react"
import Pusher from "pusher-js"

interface VoiceMessagesNavBadgeProps {
  initialUnread: number
  trainerClerkId: string
}

export function VoiceMessagesNavBadge({
  initialUnread,
  trainerClerkId,
}: VoiceMessagesNavBadgeProps) {
  const [unread, setUnread] = useState(initialUnread)

  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    })
    const channel = pusher.subscribe(`trainer-${trainerClerkId}`)

    channel.bind("client-voice-memo-added", () => {
      setUnread((n) => n + 1)
    })
    channel.bind("voice-memo-read", () => {
      setUnread((n) => Math.max(0, n - 1))
    })

    return () => {
      channel.unbind_all()
      pusher.unsubscribe(`trainer-${trainerClerkId}`)
      pusher.disconnect()
    }
  }, [trainerClerkId])

  if (unread === 0) return null

  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[11px] font-bold text-white">
      {unread > 99 ? "99+" : unread}
    </span>
  )
}
```

- [ ] **Step 2: Add Voice Messages link and badge to `sidebar.tsx`**

Open `components/layout/sidebar.tsx`. Find the `trainerLinks` array (it contains `{ href: "/messages", label: "Messages", icon: MessageSquare }`).

Add the import:
```typescript
import { Mic } from "lucide-react"
import { VoiceMessagesNavBadge } from "@/components/voice-memo/VoiceMessagesNavBadge"
import { getTrainerVoiceMessageFeed } from "@/actions/voice-memo-actions"
```

Add the nav item to `trainerLinks` after "Messages":
```typescript
{ href: "/voice-messages", label: "Voice Messages", icon: Mic },
```

The sidebar is a server component that already fetches the current user. After fetching the user, add:

```typescript
const voiceFeed = user?.role === "TRAINER"
  ? await getTrainerVoiceMessageFeed()
  : { data: [] }
const unreadVoiceCount = (voiceFeed.data ?? []).filter((i) => !i.isRead).length
```

Then in the JSX where the "Voice Messages" link renders, add the badge alongside:

```tsx
<VoiceMessagesNavBadge
  initialUnread={unreadVoiceCount}
  trainerClerkId={user.clerkId}
/>
```

The exact placement depends on how the sidebar renders link items. Look for the pattern used by the existing "Messages" link and mirror it.

- [ ] **Step 3: Apply the same changes to `mobile-nav.tsx`**

Add the same import, link entry, and `VoiceMessagesNavBadge` to `components/layout/mobile-nav.tsx`. The mobile nav mirrors the sidebar structure.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0

- [ ] **Step 5: Commit**

```bash
git add components/voice-memo/VoiceMessagesNavBadge.tsx components/layout/sidebar.tsx components/layout/mobile-nav.tsx
git commit -m "feat: add Voice Messages nav item with Pusher-driven unread badge"
```

---

### Task 13: Remove UploadThing

**Files:**
- Delete: `lib/uploadthing.ts`
- Delete: `lib/uploadthing-client.ts`
- Delete: `app/api/uploadthing/route.ts`
- Modify: all files that import from these

- [ ] **Step 1: Find all UploadThing import sites**

```bash
grep -rn "uploadthing\|useUploadThing\|OurFileRouter\|UploadButton\|UploadDropzone" \
  --include="*.tsx" --include="*.ts" \
  --exclude-dir=node_modules .
```

Record every file path returned.

- [ ] **Step 2: Remove upload UI and imports from each affected file**

For each file found in Step 1:
- Remove the import line for `uploadthing`, `@uploadthing/react`, `useUploadThing`, `OurFileRouter`, `UploadButton`, or `UploadDropzone`
- Remove any component or JSX that renders exercise video upload, exercise image upload, progress photo upload, program brief upload, or organization logo upload
- If the removed section was part of a form field backed by a Zod schema field, make that schema field optional (`z.string().optional()`) rather than required, so existing DB data isn't affected
- Do NOT remove database fields (`exerciseVideo`, `exerciseImage`, `progressPhoto`) from the Prisma schema — historical data must be preserved

- [ ] **Step 3: Delete UploadThing source files**

```bash
rm lib/uploadthing.ts lib/uploadthing-client.ts app/api/uploadthing/route.ts
```

- [ ] **Step 4: Uninstall UploadThing packages**

```bash
npm uninstall uploadthing @uploadthing/next @uploadthing/react
```

- [ ] **Step 5: Verify TypeScript compiles with no import errors**

```bash
npx tsc --noEmit
```

Expected: exits 0. If errors appear, they will be residual import references — fix them.

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all previously-passing tests still pass

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: remove UploadThing and exercise media upload UI, migrate storage to R2"
```
