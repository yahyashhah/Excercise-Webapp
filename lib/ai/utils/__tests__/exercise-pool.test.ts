import { describe, it, expect } from 'vitest'
import {
  filterByContraindications,
  buildWeekPoolWhereClause,
} from '../exercise-pool'

describe('filterByContraindications', () => {
  const exercises = [
    { id: '1', name: 'Squat', contraindications: ['knee flexion >90°', 'impact'] },
    { id: '2', name: 'Quad Set', contraindications: [] },
    { id: '3', name: 'Leg Press', contraindications: ['post-surgical knee flexion'] },
  ]

  it('returns all exercises when patient has no limitations', () => {
    const result = filterByContraindications(exercises, [])
    expect(result).toHaveLength(3)
  })

  it('excludes exercises whose contraindications overlap with patient limitations', () => {
    const result = filterByContraindications(exercises, ['knee flexion'])
    const names = result.map(e => e.name)
    expect(names).toContain('Quad Set')
    expect(names).not.toContain('Squat')
    expect(names).not.toContain('Leg Press')
  })

  it('is case-insensitive', () => {
    const result = filterByContraindications(exercises, ['IMPACT'])
    expect(result.map(e => e.name)).not.toContain('Squat')
  })
})

describe('buildWeekPoolWhereClause', () => {
  it('includes rehabStage and indicationTags when provided', () => {
    const weekPlan = {
      rehabStage: 'EARLY_REHAB' as const,
      focusAreas: ['LOWER_BODY'],
      derivedIndicationTags: ['ACL', 'knee'],
    }
    const usedIds = new Set(['abc', 'def'])
    const clause = buildWeekPoolWhereClause(weekPlan, usedIds)

    expect(clause.rehabStage).toBe('EARLY_REHAB')
    expect(clause.bodyRegion).toEqual({ in: ['LOWER_BODY'] })
    expect(clause.indicationTags).toEqual({ hasSome: ['ACL', 'knee'] })
    expect(clause.id).toEqual({ notIn: ['abc', 'def'] })
    expect(clause.isActive).toBe(true)
  })

  it('omits indicationTags filter when derivedIndicationTags is empty', () => {
    const weekPlan = {
      rehabStage: 'MID_REHAB' as const,
      focusAreas: ['UPPER_BODY'],
      derivedIndicationTags: [],
    }
    const clause = buildWeekPoolWhereClause(weekPlan, new Set())
    expect(clause.indicationTags).toBeUndefined()
  })

  it('omits used IDs from the query when set is empty', () => {
    const weekPlan = {
      rehabStage: 'MID_REHAB' as const,
      focusAreas: ['CORE'],
      derivedIndicationTags: ['low-back-pain'],
    }
    const clause = buildWeekPoolWhereClause(weekPlan, new Set())
    expect(clause.id).toBeUndefined()
  })
})
