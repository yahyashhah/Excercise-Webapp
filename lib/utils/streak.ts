function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

// Counts consecutive calendar days (ending today or yesterday) that have at
// least one completed workout. A day is only visited going backward while
// present in `completedDates` — the first gap ends the streak.
export function computeCurrentStreak(completedDates: Date[], now: Date = new Date()): number {
  const days = new Set(completedDates.map(dayKey))

  const cursor = new Date(now)
  cursor.setHours(0, 0, 0, 0)
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
  }

  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}
