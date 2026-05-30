import { describe, it, expect } from 'vitest'
import { aggregateProgramEquipment } from '../program-equipment'

const makeProgram = (equipmentPerExercise: string[][]) => ({
  workouts: [{
    blocks: [{
      exercises: equipmentPerExercise.map((eq, i) => ({
        id: String(i),
        exercise: { equipmentRequired: eq },
      })),
    }],
  }],
})

describe('aggregateProgramEquipment', () => {
  it('returns empty array when no workouts', () => {
    expect(aggregateProgramEquipment([])).toEqual([])
  })

  it('returns unique equipment across all exercises', () => {
    const program = makeProgram([
      ['Resistance Band', 'Yoga Mat'],
      ['Dumbbells', 'Yoga Mat'],
    ])
    const result = aggregateProgramEquipment(program.workouts)
    expect(result).toHaveLength(3)
    expect(result).toContain('Resistance Band')
    expect(result).toContain('Yoga Mat')
    expect(result).toContain('Dumbbells')
  })

  it('filters out "None" entries', () => {
    const program = makeProgram([['None'], ['Dumbbells', 'None']])
    const result = aggregateProgramEquipment(program.workouts)
    expect(result).not.toContain('None')
    expect(result).toEqual(['Dumbbells'])
  })

  it('handles exercises with no equipment', () => {
    const program = makeProgram([[], ['Resistance Band']])
    const result = aggregateProgramEquipment(program.workouts)
    expect(result).toEqual(['Resistance Band'])
  })

  it('aggregates equipment across multiple workouts', () => {
    const workouts = [
      { blocks: [{ exercises: [{ id: '1', exercise: { equipmentRequired: ['Chair'] } }] }] },
      { blocks: [{ exercises: [{ id: '2', exercise: { equipmentRequired: ['Chair', 'Foam Roller'] } }] }] },
    ]
    const result = aggregateProgramEquipment(workouts)
    expect(result).toHaveLength(2)
    expect(result).toContain('Chair')
    expect(result).toContain('Foam Roller')
  })

  it('returns results sorted alphabetically', () => {
    const program = makeProgram([['Yoga Mat', 'Dumbbells', 'Chair']])
    const result = aggregateProgramEquipment(program.workouts)
    expect(result).toEqual(['Chair', 'Dumbbells', 'Yoga Mat'])
  })
})
