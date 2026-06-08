# Real-Time Messaging (Pusher Channels) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade clinic-patient messaging from a refresh-to-see model to fully real-time using Pusher Channels, adding instant message delivery, typing indicators, read receipts, and live unread counts.

**Architecture:** Pusher Channels acts as a relay — server actions save to MongoDB then fire Pusher events; browser clients subscribe to private/presence channels and update React state on the fly. The DB remains the source of truth; Pusher is delivery only. If Pusher is unreachable, the message is already saved and visible on next load.

**Tech Stack:** `pusher` (server SDK), `pusher-js` (browser SDK), Next.js 16 App Router, Clerk auth, Vitest

---

## File Map

| File | Status | Purpose |
|---|---|---|
| `lib/pusher-channels.ts` | Create | Channel name utilities (deterministic thread + inbox names) |
| `lib/pusher.ts` | Create | Server-side Pusher singleton |
| `lib/pusher-client.ts` | Create | Browser-side Pusher singleton (lazy init) |
| `app/api/pusher/auth/route.ts` | Create | Pusher channel auth — validates Clerk session before allowing subscriptions |
| `actions/message-actions.ts` | Modify | Fire Pusher events after DB writes |
| `components/messages/message-thread.tsx` | Modify | Subscribe to thread channel; live messages, typing indicator, read receipts |
| `components/messages/messages-inbox-client.tsx` | Create | Client component for live unread counts + presence dots |
| `app/(platform)/messages/page.tsx` | Modify | Pass `currentUserId` down; swap static list for `MessagesInboxClient` |

---

## Pusher Dashboard Setup (do this before Task 1)

1. Go to [pusher.com](https://pusher.com) → Create account → Create a **Channels** app
2. Go to **App Settings** → enable **"Client Events"** (required for typing indicators)
3. Go to **App Keys** → copy the 4 values
4. Add to `.env.local`:

```
PUSHER_APP_ID=your_app_id
NEXT_PUBLIC_PUSHER_KEY=your_key
PUSHER_SECRET=your_secret
NEXT_PUBLIC_PUSHER_CLUSTER=your_cluster
```

---

## Task 1: Install Pusher packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
npm install pusher pusher-js
```

Expected: `added 2 packages`

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install pusher and pusher-js"
```

---

## Task 2: Channel name utilities + server Pusher client

**Files:**
- Create: `lib/pusher-channels.ts`
- Create: `lib/pusher.ts`
- Test: `lib/__tests__/pusher-channels.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/__tests__/pusher-channels.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { threadChannel, inboxChannel } from '../pusher-channels'

describe('threadChannel', () => {
  it('returns the same name regardless of argument order', () => {
    expect(threadChannel('bbb', 'aaa')).toBe('private-thread-aaa-bbb')
    expect(threadChannel('aaa', 'bbb')).toBe('private-thread-aaa-bbb')
  })

  it('sorts IDs alphabetically so both sides get the same channel name', () => {
    const a = threadChannel('user_z', 'user_a')
    const b = threadChannel('user_a', 'user_z')
    expect(a).toBe(b)
  })
})

describe('inboxChannel', () => {
  it('returns a presence channel scoped to the given userId', () => {
    expect(inboxChannel('user_123')).toBe('presence-inbox-user_123')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run lib/__tests__/pusher-channels.test.ts
```

Expected: `FAIL — Cannot find module '../pusher-channels'`

- [ ] **Step 3: Implement channel utilities**

Create `lib/pusher-channels.ts`:

```typescript
export function threadChannel(userId1: string, userId2: string): string {
  return `private-thread-${[userId1, userId2].sort().join('-')}`
}

export function inboxChannel(userId: string): string {
  return `presence-inbox-${userId}`
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run lib/__tests__/pusher-channels.test.ts
```

Expected: `PASS (3 tests)`

- [ ] **Step 5: Create server-side Pusher singleton**

Create `lib/pusher.ts`:

```typescript
import Pusher from 'pusher'

declare global {
  // eslint-disable-next-line no-var
  var _pusherServer: Pusher | undefined
}

function createPusherServer(): Pusher {
  return new Pusher({
    appId: process.env.PUSHER_APP_ID!,
    key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
    secret: process.env.PUSHER_SECRET!,
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    useTLS: true,
  })
}

// Reuse across hot-reloads in dev (same pattern as Prisma singleton)
export const pusherServer: Pusher =
  globalThis._pusherServer ?? (globalThis._pusherServer = createPusherServer())
```

- [ ] **Step 6: Commit**

```bash
git add lib/pusher-channels.ts lib/pusher.ts lib/__tests__/pusher-channels.test.ts
git commit -m "feat: add Pusher server client and channel name utilities"
```

---

## Task 3: Browser-side Pusher client

**Files:**
- Create: `lib/pusher-client.ts`

- [ ] **Step 1: Create the lazy browser singleton**

Create `lib/pusher-client.ts`:

```typescript
import PusherClient from 'pusher-js'

let _client: PusherClient | null = null

export function getPusherClient(): PusherClient {
  if (!_client) {
    _client = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      channelAuthorization: {
        endpoint: '/api/pusher/auth',
        transport: 'ajax',
      },
    })
  }
  return _client
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/pusher-client.ts
git commit -m "feat: add browser-side Pusher client singleton"
```

---

## Task 4: Pusher channel auth route

**Files:**
- Create: `app/api/pusher/auth/route.ts`
- Test: `app/api/pusher/auth/__tests__/route.test.ts`

Authorization rules:
- `private-thread-{id1}-{id2}` → allowed if `dbUser.id` is either id1 or id2
- `presence-inbox-{userId}` → allowed for any authenticated user (low-sensitivity presence info; enables showing online dots for contacts)
- All other channels → 403

- [ ] **Step 1: Write failing tests**

Create `app/api/pusher/auth/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))
vi.mock('@/lib/pusher', () => ({
  pusherServer: { authorizeChannel: vi.fn() },
}))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { pusherServer } from '@/lib/pusher'
import { POST } from '../route'

const mockAuth = vi.mocked(auth)
const mockFindUnique = vi.mocked(prisma.user.findUnique)
const mockAuthorize = vi.mocked(pusherServer.authorizeChannel)

function makeRequest(body: Record<string, string>): Request {
  return new Request('http://localhost/api/pusher/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/pusher/auth', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as any)
    const res = await POST(makeRequest({ socket_id: 's1', channel_name: 'private-thread-a-b' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 for unknown channel patterns', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_x' } as any)
    mockFindUnique.mockResolvedValue({ id: 'user_a', firstName: 'A', lastName: 'B', imageUrl: null } as any)
    const res = await POST(makeRequest({ socket_id: 's1', channel_name: 'public-channel' }))
    expect(res.status).toBe(403)
  })

  it('returns 403 when user is not a participant in the thread channel', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_x' } as any)
    mockFindUnique.mockResolvedValue({ id: 'user_c', firstName: 'C', lastName: 'D', imageUrl: null } as any)
    const res = await POST(makeRequest({ socket_id: 's1', channel_name: 'private-thread-user_a-user_b' }))
    expect(res.status).toBe(403)
  })

  it('authorizes a valid private thread channel when user is a participant', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_x' } as any)
    mockFindUnique.mockResolvedValue({ id: 'user_a', firstName: 'A', lastName: 'B', imageUrl: null } as any)
    mockAuthorize.mockReturnValue({ auth: 'tok' } as any)
    const res = await POST(makeRequest({ socket_id: 's1', channel_name: 'private-thread-user_a-user_b' }))
    expect(res.status).toBe(200)
    expect(mockAuthorize).toHaveBeenCalledWith('s1', 'private-thread-user_a-user_b', undefined)
  })

  it('authorizes a presence inbox channel for any authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_x' } as any)
    mockFindUnique.mockResolvedValue({ id: 'user_a', firstName: 'Alice', lastName: 'Smith', imageUrl: null } as any)
    mockAuthorize.mockReturnValue({ auth: 'tok', channel_data: '{}' } as any)
    const res = await POST(makeRequest({ socket_id: 's1', channel_name: 'presence-inbox-user_b' }))
    expect(res.status).toBe(200)
    expect(mockAuthorize).toHaveBeenCalledWith(
      's1',
      'presence-inbox-user_b',
      expect.objectContaining({ user_id: 'user_a' }),
    )
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run "app/api/pusher/auth/__tests__/route.test.ts"
```

Expected: `FAIL — Cannot find module '../route'`

- [ ] **Step 3: Implement the auth route**

Create `app/api/pusher/auth/route.ts`:

```typescript
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pusherServer } from '@/lib/pusher'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 401 })

  const params = new URLSearchParams(await req.text())
  const socketId = params.get('socket_id')!
  const channelName = params.get('channel_name')!

  let presenceData: { user_id: string; user_info: object } | undefined

  if (channelName.startsWith('private-thread-')) {
    // Channel format: private-thread-{idA}-{idB} (IDs sorted, both are 24-char ObjectIds)
    if (!channelName.includes(dbUser.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (channelName.startsWith('presence-inbox-')) {
    // Any authenticated user may subscribe (enables online dots for contacts)
    presenceData = {
      user_id: dbUser.id,
      user_info: {
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        imageUrl: dbUser.imageUrl,
      },
    }
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const authResponse = pusherServer.authorizeChannel(socketId, channelName, presenceData)
  return NextResponse.json(authResponse)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run "app/api/pusher/auth/__tests__/route.test.ts"
```

Expected: `PASS (5 tests)`

- [ ] **Step 5: Commit**

```bash
git add "app/api/pusher/auth/route.ts" "app/api/pusher/auth/__tests__/route.test.ts"
git commit -m "feat: add Pusher channel auth route"
```

---

## Task 5: Fire Pusher events from server actions

**Files:**
- Modify: `actions/message-actions.ts`
- Test: `actions/__tests__/message-actions.test.ts`

After every DB write, fire Pusher events as fire-and-forget (a Pusher failure must never fail the action — the message is already persisted).

- [ ] **Step 1: Write failing tests**

Create `actions/__tests__/message-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() }, message: { create: vi.fn(), updateMany: vi.fn() } },
}))
vi.mock('@/lib/pusher', () => ({ pusherServer: { trigger: vi.fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { pusherServer } from '@/lib/pusher'
import { sendMessageAction, markMessagesReadAction } from '../message-actions'

const mockAuth = vi.mocked(auth)
const mockFindUnique = vi.mocked(prisma.user.findUnique)
const mockCreate = vi.mocked(prisma.message.create)
const mockUpdateMany = vi.mocked(prisma.message.updateMany)
const mockTrigger = vi.mocked(pusherServer.trigger)

beforeEach(() => vi.clearAllMocks())

const baseMessage = {
  id: 'msg_1',
  senderId: 'sender_id',
  recipientId: 'recipient_id',
  content: 'Hello',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  sender: { firstName: 'Alice', lastName: 'Smith', imageUrl: null },
  recipient: { firstName: 'Bob', lastName: 'Jones', imageUrl: null },
}

describe('sendMessageAction', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'clerk_123' } as any)
    mockFindUnique.mockResolvedValue({ id: 'sender_id', firstName: 'Alice', lastName: 'Smith', imageUrl: null } as any)
    mockCreate.mockResolvedValue(baseMessage as any)
    mockTrigger.mockResolvedValue({} as any)
  })

  it('saves the message and returns success', async () => {
    const result = await sendMessageAction({ recipientId: 'recipient_id', content: 'Hello' })
    expect(result.success).toBe(true)
    expect(mockCreate).toHaveBeenCalledOnce()
  })

  it('fires a new-message event on the thread channel', async () => {
    await sendMessageAction({ recipientId: 'recipient_id', content: 'Hello' })
    // Allow the fire-and-forget Promise.all to resolve
    await new Promise((r) => setTimeout(r, 0))
    const threadTrigger = mockTrigger.mock.calls.find((c) => c[0].startsWith('private-thread-'))
    expect(threadTrigger).toBeDefined()
    expect(threadTrigger![1]).toBe('new-message')
    expect(threadTrigger![2]).toMatchObject({ id: 'msg_1', content: 'Hello' })
  })

  it('fires a new-message event on the recipients inbox channel', async () => {
    await sendMessageAction({ recipientId: 'recipient_id', content: 'Hello' })
    await new Promise((r) => setTimeout(r, 0))
    const inboxTrigger = mockTrigger.mock.calls.find((c) => c[0] === 'presence-inbox-recipient_id')
    expect(inboxTrigger).toBeDefined()
    expect(inboxTrigger![1]).toBe('new-message')
  })

  it('still returns success when Pusher trigger throws', async () => {
    mockTrigger.mockRejectedValue(new Error('Pusher unavailable'))
    const result = await sendMessageAction({ recipientId: 'recipient_id', content: 'Hello' })
    expect(result.success).toBe(true)
  })
})

describe('markMessagesReadAction', () => {
  it('fires a messages-read event on the thread channel', async () => {
    mockAuth.mockResolvedValue({ userId: 'clerk_123' } as any)
    mockFindUnique.mockResolvedValue({ id: 'reader_id' } as any)
    mockUpdateMany.mockResolvedValue({ count: 2 } as any)
    mockTrigger.mockResolvedValue({} as any)

    await markMessagesReadAction('sender_id')
    await new Promise((r) => setTimeout(r, 0))

    const call = mockTrigger.mock.calls.find((c) => c[0].startsWith('private-thread-'))
    expect(call).toBeDefined()
    expect(call![1]).toBe('messages-read')
    expect(call![2]).toEqual({ readByUserId: 'reader_id' })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run actions/__tests__/message-actions.test.ts
```

Expected: `FAIL`

- [ ] **Step 3: Update message actions**

Replace `actions/message-actions.ts`:

```typescript
"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendMessageSchema } from "@/lib/validators/message";
import * as messageService from "@/lib/services/message.service";
import { pusherServer } from "@/lib/pusher";
import { threadChannel, inboxChannel } from "@/lib/pusher-channels";

export async function sendMessageAction(input: {
  recipientId: string;
  content: string;
  planId?: string;
  planExerciseId?: string;
}) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  try {
    const message = await messageService.sendMessage({
      senderId: dbUser.id,
      ...parsed.data,
    });

    const channel = threadChannel(dbUser.id, parsed.data.recipientId);
    const payload = {
      id: message.id,
      senderId: message.senderId,
      recipientId: message.recipientId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      sender: {
        firstName: message.sender.firstName,
        lastName: message.sender.lastName,
        imageUrl: message.sender.imageUrl,
      },
    };

    Promise.all([
      pusherServer.trigger(channel, "new-message", payload),
      pusherServer.trigger(inboxChannel(parsed.data.recipientId), "new-message", payload),
    ]).catch((err) => console.error("[pusher] trigger failed:", err));

    revalidatePath("/messages");
    return { success: true as const, data: message };
  } catch (error) {
    console.error("Failed to send message:", error);
    return { success: false as const, error: "Failed to send message" };
  }
}

export async function markMessagesReadAction(senderId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false as const, error: "User not found" };

  try {
    await messageService.markRead(senderId, dbUser.id);

    pusherServer
      .trigger(threadChannel(senderId, dbUser.id), "messages-read", { readByUserId: dbUser.id })
      .catch((err) => console.error("[pusher] trigger failed:", err));

    revalidatePath("/messages");
    return { success: true as const };
  } catch (error) {
    console.error("Failed to mark messages read:", error);
    return { success: false as const, error: "Failed to mark as read" };
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run actions/__tests__/message-actions.test.ts
```

Expected: `PASS (5 tests)`

- [ ] **Step 5: Commit**

```bash
git add actions/message-actions.ts actions/__tests__/message-actions.test.ts
git commit -m "feat: fire Pusher events from message server actions"
```

---

## Task 6: Real-time MessageThread component

**Files:**
- Modify: `components/messages/message-thread.tsx`

On mount: subscribe to the private thread channel. Incoming `new-message` events are deduped by ID and appended. `client-typing` events from the other user show a bouncing-dots indicator that auto-clears after 2 s. The sender's own `sendMessageAction` call still controls optimistic clearing.

- [ ] **Step 1: Replace `components/messages/message-thread.tsx`**

```typescript
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { sendMessageAction } from "@/actions/message-actions";
import { formatRelativeTime } from "@/lib/utils/formatting";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";
import { getPusherClient } from "@/lib/pusher-client";
import { threadChannel } from "@/lib/pusher-channels";

interface Message {
  id: string;
  senderId: string;
  content: string;
  createdAt: Date;
  sender: { firstName: string; lastName: string; imageUrl: string | null };
}

interface MessageThreadProps {
  messages: Message[];
  currentUserId: string;
  recipientId: string;
  recipientName: string;
}

export function MessageThread({
  messages: initialMessages,
  currentUserId,
  recipientId,
  recipientName,
}: MessageThreadProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [recipientTyping, setRecipientTyping] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, recipientTyping]);

  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(threadChannel(currentUserId, recipientId));

    channel.bind(
      "new-message",
      (data: Omit<Message, "createdAt"> & { createdAt: string }) => {
        const msg: Message = { ...data, createdAt: new Date(data.createdAt) };
        setMessages((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
        );
        // Clear typing indicator when a message arrives
        setRecipientTyping(false);
        if (typingClearRef.current) clearTimeout(typingClearRef.current);
      },
    );

    channel.bind("client-typing", (data: { userId: string }) => {
      if (data.userId !== recipientId) return;
      setRecipientTyping(true);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      typingClearRef.current = setTimeout(() => setRecipientTyping(false), 2000);
    });

    return () => {
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
      pusher.unsubscribe(threadChannel(currentUserId, recipientId));
    };
  }, [currentUserId, recipientId]);

  const triggerTyping = useCallback(() => {
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      const ch = getPusherClient().channel(threadChannel(currentUserId, recipientId));
      ch?.trigger("client-typing", { userId: currentUserId });
    }, 300);
  }, [currentUserId, recipientId]);

  async function handleSend() {
    if (!content.trim()) return;
    setSending(true);
    const result = await sendMessageAction({ recipientId, content: content.trim() });
    setSending(false);
    if (result.success) {
      setContent("");
    } else {
      toast.error(result.error);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const recipientInitials = recipientName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 p-4">
        <h2 className="font-semibold text-slate-900">{recipientName}</h2>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((msg) => {
            const isOwn = msg.senderId === currentUserId;
            return (
              <div key={msg.id} className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={msg.sender.imageUrl || undefined} />
                  <AvatarFallback className="text-xs">
                    {msg.sender.firstName[0]}
                    {msg.sender.lastName[0]}
                  </AvatarFallback>
                </Avatar>
                <div className={`max-w-[70%] ${isOwn ? "text-right" : ""}`}>
                  <div
                    className={`inline-block rounded-lg px-4 py-2 text-sm ${
                      isOwn ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-900"
                    }`}
                  >
                    {msg.content}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatRelativeTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {recipientTyping && (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="bg-slate-200 text-xs">{recipientInitials}</AvatarFallback>
              </Avatar>
              <div className="inline-flex items-center gap-1 rounded-2xl bg-slate-100 px-4 py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-slate-200 p-4">
        <div className="flex gap-2">
          <Textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              triggerTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="min-h-[2.5rem] resize-none"
          />
          <Button onClick={handleSend} disabled={sending || !content.trim()} size="icon">
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/messages/message-thread.tsx
git commit -m "feat: real-time message delivery and typing indicators in MessageThread"
```

---

## Task 7: Live inbox — unread counts and presence dots

**Files:**
- Create: `components/messages/messages-inbox-client.tsx`
- Modify: `app/(platform)/messages/page.tsx`

The server page keeps its data-fetching logic. The static thread list is extracted into a client component that subscribes to the current user's presence-inbox channel and updates unread counts as new messages arrive. Each contact's presence channel is also subscribed to for the online dot.

- [ ] **Step 1: Create `components/messages/messages-inbox-client.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils/formatting";
import { getPusherClient } from "@/lib/pusher-client";
import { inboxChannel } from "@/lib/pusher-channels";

const threadGradients = [
  "from-blue-400 to-indigo-500",
  "from-violet-400 to-purple-500",
  "from-emerald-400 to-teal-500",
  "from-rose-400 to-pink-500",
  "from-amber-400 to-orange-500",
  "from-cyan-400 to-blue-500",
];

function getThreadGradient(name: string) {
  return threadGradients[name.charCodeAt(0) % threadGradients.length];
}

interface Thread {
  otherUser: {
    id: string;
    firstName: string;
    lastName: string;
    imageUrl: string | null;
    role: string;
  };
  lastMessage: { content: string; createdAt: Date };
  unreadCount: number;
}

interface MessagesInboxClientProps {
  initialThreads: Thread[];
  currentUserId: string;
}

export function MessagesInboxClient({
  initialThreads,
  currentUserId,
}: MessagesInboxClientProps) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    const pusher = getPusherClient();

    // Subscribe to own inbox channel — receives new-message events
    const myInbox = pusher.subscribe(inboxChannel(currentUserId)) as any;

    myInbox.bind(
      "new-message",
      (data: { senderId: string; content: string; createdAt: string }) => {
        if (data.senderId === currentUserId) return; // own sent messages don't bump unread
        setThreads((prev) => {
          const idx = prev.findIndex((t) => t.otherUser.id === data.senderId);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            lastMessage: { content: data.content, createdAt: new Date(data.createdAt) },
            unreadCount: updated[idx].unreadCount + 1,
          };
          // Move the updated thread to the top
          return [updated[idx], ...updated.filter((_, i) => i !== idx)];
        });
      },
    );

    // Subscribe to each contact's presence channel for online dots
    const contactIds = initialThreads.map((t) => t.otherUser.id);
    contactIds.forEach((contactId) => {
      const ch = pusher.subscribe(inboxChannel(contactId)) as any;

      ch.bind("pusher:subscription_succeeded", (members: any) => {
        const ids: string[] = [];
        members.each((m: any) => ids.push(m.id));
        if (ids.length > 0) {
          setOnlineUsers((prev) => new Set([...prev, ...ids]));
        }
      });

      ch.bind("pusher:member_added", (member: any) => {
        setOnlineUsers((prev) => new Set([...prev, member.id]));
      });

      ch.bind("pusher:member_removed", (member: any) => {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          next.delete(member.id);
          return next;
        });
      });
    });

    return () => {
      pusher.unsubscribe(inboxChannel(currentUserId));
      contactIds.forEach((id) => pusher.unsubscribe(inboxChannel(id)));
    };
  }, [currentUserId]); // initialThreads intentionally omitted — subscriptions are set up once on mount

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
      {threads.map((thread, i) => {
        const hasUnread = thread.unreadCount > 0;
        const fullName = `${thread.otherUser.firstName} ${thread.otherUser.lastName}`;
        const initials = `${thread.otherUser.firstName[0]}${thread.otherUser.lastName[0]}`;
        const gradient = getThreadGradient(thread.otherUser.firstName);
        const isOnline = onlineUsers.has(thread.otherUser.id);

        return (
          <Link key={thread.otherUser.id} href={`/messages/${thread.otherUser.id}`}>
            <div
              className={`group relative flex items-center gap-4 px-5 py-4 transition-all duration-150 hover:bg-muted/40 ${
                hasUnread ? "bg-primary/3" : ""
              } ${i !== 0 ? "border-t border-border/50" : ""}`}
            >
              {hasUnread && (
                <span className="absolute left-0 top-1/2 h-8 w-0.75 -translate-y-1/2 rounded-r-full bg-primary" />
              )}

              <div className="relative shrink-0">
                <Avatar className="h-11 w-11 ring-2 ring-white shadow-sm">
                  <AvatarImage src={thread.otherUser.imageUrl || undefined} />
                  <AvatarFallback
                    className={`bg-linear-to-br ${gradient} text-sm font-bold text-white`}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {hasUnread ? (
                  <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                ) : isOnline ? (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p
                    className={`truncate text-sm transition-colors group-hover:text-primary ${
                      hasUnread
                        ? "font-semibold text-foreground"
                        : "font-medium text-foreground/80"
                    }`}
                  >
                    {fullName}
                  </p>
                  <span
                    className={`shrink-0 text-xs ${
                      hasUnread ? "font-medium text-primary" : "text-muted-foreground/60"
                    }`}
                  >
                    {formatRelativeTime(thread.lastMessage.createdAt)}
                  </span>
                </div>
                <p
                  className={`mt-0.5 truncate text-sm leading-snug ${
                    hasUnread ? "font-medium text-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  {thread.lastMessage.content}
                </p>
              </div>

              {hasUnread && (
                <Badge className="h-5 min-w-5 shrink-0 justify-center border-0 bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
                </Badge>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Update `app/(platform)/messages/page.tsx`**

```typescript
import { getCurrentUser } from "@/lib/current-user";
import { getInboxThreads } from "@/lib/services/message.service";
import { getPatientsForClinician, getCliniciansForPatient } from "@/lib/services/patient.service";
import { NewMessageDialog } from "@/components/messages/new-message-dialog";
import { MessagesInboxClient } from "@/components/messages/messages-inbox-client";
import { MessageSquare } from "lucide-react";

export default async function MessagesPage() {
  const user = await getCurrentUser();
  const threads = await getInboxThreads(user.id);

  const contacts =
    user.role === "CLINICIAN"
      ? await getPatientsForClinician(user.id)
      : await getCliniciansForPatient(user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Messages</h2>
          <p className="text-muted-foreground">
            {threads.length > 0
              ? `${threads.length} conversation${threads.length !== 1 ? "s" : ""}`
              : "Your conversations"}
          </p>
        </div>
        <NewMessageDialog contacts={contacts} />
      </div>

      {threads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="mt-5 text-lg font-semibold">No messages yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Start a conversation by clicking <strong>New Message</strong> above.
          </p>
        </div>
      ) : (
        <MessagesInboxClient initialThreads={threads} currentUserId={user.id} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/messages/messages-inbox-client.tsx "app/(platform)/messages/page.tsx"
git commit -m "feat: live inbox with unread count updates and presence dots"
```

---

## Task 8: Verify everything works

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: all pass (existing + new)

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Start dev server**

```bash
npm run dev
```

- [ ] **Step 4: Manual smoke test**

Open two browser tabs signed in as two different users (clinic + patient).

| Test | Expected |
|---|---|
| Send message from Tab A | Appears instantly in Tab B without refresh |
| Type in input in Tab A | Tab B shows bouncing dots typing indicator |
| Stop typing for 2 s | Typing indicator disappears from Tab B |
| Send message — typing indicator clears | Dots gone immediately when message arrives |
| Both users on messages page | Green presence dot shows in each other's inbox |
| User closes tab | Green dot disappears within a few seconds |
| Unread badge in inbox | Updates live without page refresh |
