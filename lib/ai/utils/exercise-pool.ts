interface ExerciseWithContraindications {
  id: string
  name: string
  contraindications: string[]
}

export function filterByContraindications<T extends ExerciseWithContraindications>(
  exercises: T[],
  patientLimitations: string[]
): T[] {
  if (patientLimitations.length === 0) return exercises
  return exercises.filter(exercise => {
    const contraLower = exercise.contraindications.map(c => c.toLowerCase())
    return !patientLimitations.some(limitation =>
      contraLower.some(
        contra =>
          contra.includes(limitation.toLowerCase()) ||
          limitation.toLowerCase().includes(contra)
      )
    )
  })
}

interface WeekPoolInput {
  rehabStage: string
  focusAreas: string[]
  derivedIndicationTags: string[]
}

export function buildWeekPoolWhereClause(
  weekPlan: WeekPoolInput,
  usedIds: Set<string>
): Record<string, unknown> {
  const clause: Record<string, unknown> = {
    isActive: true,
    rehabStage: weekPlan.rehabStage,
    bodyRegion: { in: weekPlan.focusAreas },
  }

  if (weekPlan.derivedIndicationTags.length > 0) {
    clause.indicationTags = { hasSome: weekPlan.derivedIndicationTags }
  }

  if (usedIds.size > 0) {
    clause.id = { notIn: [...usedIds] }
  }

  return clause
}
