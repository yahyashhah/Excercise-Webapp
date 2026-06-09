import { describe, it, expect } from "vitest";
import { stripIds } from "../clipboard-context";

describe("stripIds", () => {
  it("removes id from a flat object", () => {
    const result = stripIds({ id: "abc", name: "test", orderIndex: 0 });
    expect(result).toEqual({ name: "test", orderIndex: 0 });
    expect("id" in result).toBe(false);
  });

  it("removes ids recursively from nested objects", () => {
    const input = {
      id: "workout-1",
      name: "Day 1",
      blocks: [
        {
          id: "block-1",
          name: "Main",
          exercises: [
            {
              id: "ex-1",
              exerciseId: "e-1",
              sets: [{ id: "set-1", orderIndex: 0 }],
            },
          ],
        },
      ],
    };
    const result = stripIds(input);
    expect("id" in result).toBe(false);
    expect("id" in result.blocks[0]).toBe(false);
    expect("id" in result.blocks[0].exercises[0]).toBe(false);
    expect("id" in result.blocks[0].exercises[0].sets[0]).toBe(false);
    expect(result.blocks[0].exercises[0].exerciseId).toBe("e-1");
  });

  it("preserves non-id display fields like _exerciseName", () => {
    const result = stripIds({
      id: "ex-1",
      exerciseId: "lib-1",
      _exerciseName: "Squat",
      orderIndex: 0,
    });
    expect(result).toHaveProperty("_exerciseName", "Squat");
    expect(result).toHaveProperty("exerciseId", "lib-1");
    expect("id" in result).toBe(false);
  });

  it("handles top-level arrays", () => {
    const result = stripIds([
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ]);
    expect(result).toEqual([{ value: 1 }, { value: 2 }]);
  });

  it("returns primitives unchanged", () => {
    expect(stripIds(42)).toBe(42);
    expect(stripIds("hello")).toBe("hello");
    expect(stripIds(null)).toBe(null);
  });
});
