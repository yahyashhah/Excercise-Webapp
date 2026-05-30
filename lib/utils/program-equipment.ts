export function aggregateProgramEquipment(workouts: Record<string, unknown>[]): string[] {
  const all = workouts
    .flatMap((w) => (w.blocks as Record<string, unknown>[]) ?? [])
    .flatMap((b) => (b.exercises as Record<string, unknown>[]) ?? [])
    .flatMap((be) => {
      const ex = be.exercise as Record<string, unknown> | null
      return (ex?.equipmentRequired as string[]) ?? []
    })
    .filter((eq) => eq && eq.toLowerCase() !== 'none')

  return [...new Set(all)].sort()
}
