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
