# Real-Time Messaging Design
**Date:** 2026-06-08  
**Status:** Approved

## Overview

Upgrade the existing clinic-patient messaging system from a server-action-only (refresh-to-see) model to fully real-time using Pusher Channels. Messages, typing indicators, read receipts, and unread counts all update live without any page refresh.

## Stack

- **Next.js 16 App Router** + **React 19**
- **MongoDB** via Prisma (no schema changes)
- **Clerk** for authentication
- **Pusher Channels** as the real-time relay (managed WebSocket service)

## Architecture

```
User sends message
      │
      ▼
sendMessageAction (server action)
  ├── prisma.message.create()  ← DB write (source of truth)
  └── pusher.trigger()         ← fires event to Pusher servers
                                        │
                                        ▼
                               Pusher WebSocket servers
                                        │
                              ┌─────────┴─────────┐
                              ▼                   ▼
                    recipient browser       sender browser
                    (appends message)    (deduplicates by ID)
```

Pusher is a **delivery layer only** — the database remains the source of truth. If Pusher is unavailable, messages are still saved and visible on next load.

## Pusher Channels

| Channel | Type | Purpose |
|---|---|---|
| `private-thread-{id1}-{id2}` | Private | Deliver new messages and read receipts within a conversation. IDs sorted alphabetically so both users subscribe to the same name. |
| `presence-inbox-{userId}` | Presence | Per-user channel for live unread count updates and online presence dot in the inbox list. |

Client events (typing indicators) are sent directly from the browser on the thread channel — no server round-trip, Pusher forwards them to the other subscriber.

## Pusher Events

| Event | Direction | Payload | Channel |
|---|---|---|---|
| `new-message` | Server → clients | `{ id, senderId, recipientId, content, createdAt, sender }` | thread |
| `messages-read` | Server → clients | `{ readByUserId }` | thread |
| `client-typing` | Client → client | `{ userId }` | thread |

## Authentication

A new route `app/api/pusher/auth/route.ts` handles Pusher channel authentication:
- Validates the Clerk session (`auth()`)
- Looks up `dbUser` by `clerkId`
- Authorizes private channels only if `dbUser.id` appears in the channel name
- Authorizes presence channels only if the channel is `presence-inbox-{dbUser.id}`

## Files Changed

### New
- `lib/pusher.ts` — server-side Pusher client singleton (`new Pusher(...)`)
- `lib/pusher-client.ts` — browser-side Pusher singleton (lazy-initialized, exported as `getPusherClient()`)
- `app/api/pusher/auth/route.ts` — channel auth endpoint

### Updated
- `actions/message-actions.ts`
  - `sendMessageAction`: after `prisma.message.create`, call `pusher.trigger(threadChannel, 'new-message', messagePayload)`
  - `markMessagesReadAction`: after `prisma.message.updateMany`, call `pusher.trigger(threadChannel, 'messages-read', { readByUserId })`
- `components/messages/message-thread.tsx`
  - On mount: subscribe to `private-thread-{...}` channel
  - On `new-message`: append to local message list (dedup by ID)
  - On `messages-read`: update read state visually
  - On `client-typing`: show "{name} is typing…" with 2s auto-clear
  - On input change: trigger `client-typing` event (debounced 300ms)
- `app/(platform)/messages/page.tsx`
  - Convert to a hybrid: server component fetches initial threads, passes to a client wrapper
  - Client wrapper subscribes to `presence-inbox-{userId}` for live unread count updates and online dots

## Environment Variables

```
PUSHER_APP_ID=
NEXT_PUBLIC_PUSHER_KEY=
PUSHER_SECRET=
NEXT_PUBLIC_PUSHER_CLUSTER=
```

`NEXT_PUBLIC_` prefix exposes the key and cluster to the browser (safe — these are public credentials). `PUSHER_APP_ID` and `PUSHER_SECRET` stay server-only.

## Error Handling

| Scenario | Behavior |
|---|---|
| Pusher trigger fails | Message already saved to DB; no message loss. Recipient sees it on next load. |
| Auth route rejects (expired session) | Client cannot subscribe; send/receive via server actions still works. |
| Typing event lost | Ephemeral, no impact. Auto-clears after 2s anyway. |
| Duplicate message (own send + Pusher echo) | Deduplicated by message `id` in client state. |

## Typing Indicator Behavior

- Input `onChange` fires a debounced (300ms) `client-typing` client event
- Recipient sees "{FirstName} is typing…" below the last message
- Indicator auto-clears 2 seconds after the last received typing event
- Never touches the database

## Online Presence

- Users join `presence-inbox-{userId}` when the inbox or thread page is open
- The inbox list shows a small green dot next to contacts who are currently subscribed
- Dot disappears when the user closes the tab or navigates away (Pusher handles disconnect detection)

## Out of Scope

- Push notifications (browser/mobile) when the tab is closed
- Message reactions or attachments
- Group messaging (more than 2 participants)
- Message deletion or editing
