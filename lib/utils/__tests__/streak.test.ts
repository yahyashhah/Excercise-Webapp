import { describe, it, expect } from "vitest"
import { computeCurrentStreak } from "../streak"

describe("computeCurrentStreak", () => {
  const now = new Date(2026, 5, 15, 10, 0, 0) // June 15, 2026

  it("returns 0 when there are no completions", () => {
    expect(computeCurrentStreak([], now)).toBe(0)
  })

  it("counts today and consecutive prior days", () => {
    const dates = [
      new Date(2026, 5, 15),
      new Date(2026, 5, 14),
      new Date(2026, 5, 13),
    ]
    expect(computeCurrentStreak(dates, now)).toBe(3)
  })

  it("still counts a streak ending yesterday if nothing happened today", () => {
    const dates = [new Date(2026, 5, 14), new Date(2026, 5, 13)]
    expect(computeCurrentStreak(dates, now)).toBe(2)
  })

  it("stops at the first gap", () => {
    const dates = [new Date(2026, 5, 15), new Date(2026, 5, 14), new Date(2026, 5, 11)]
    expect(computeCurrentStreak(dates, now)).toBe(2)
  })

  it("resets to 0 when the most recent completion is more than a day old", () => {
    const dates = [new Date(2026, 5, 10)]
    expect(computeCurrentStreak(dates, now)).toBe(0)
  })
})
