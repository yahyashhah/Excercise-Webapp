export function threadChannel(userId1: string, userId2: string): string {
  return `private-thread-${[userId1, userId2].sort().join('-')}`
}

export function inboxChannel(userId: string): string {
  return `presence-inbox-${userId}`
}
