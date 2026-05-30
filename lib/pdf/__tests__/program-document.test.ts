import { describe, it, expect } from 'vitest'
import { buildProgramPdfSections } from '../program-document'

const makeWorkout = (name: string, exercises: string[]) => ({
  id: '1',
  name,
  estimatedMinutes: null,
  blocks: [{
    id: 'b1',
    name: 'Block 1',
    type: 'NORMAL',
    rounds: 1,
    exercises: exercises.map((exName, i) => ({
      id: String(i),
      notes: null,
      restSeconds: null,
      exercise: {
        name: exName,
        equipmentRequired: ['Resistance Band'],
        description: null,
      },
      sets: [{ targetReps: 10, targetWeight: null, targetDuration: null, setType: 'NORMAL' }],
    })),
  }],
})

describe('buildProgramPdfSections', () => {
  it('returns one section per workout', () => {
    const sections = buildProgramPdfSections([
      makeWorkout('Day 1', ['Squat', 'Lunge']),
      makeWorkout('Day 2', ['Bridge']),
    ])
    expect(sections).toHaveLength(2)
    expect(sections[0].workoutName).toBe('Day 1')
    expect(sections[1].workoutName).toBe('Day 2')
  })

  it('lists all exercises in each section', () => {
    const sections = buildProgramPdfSections([makeWorkout('Day 1', ['Squat', 'Lunge'])])
    expect(sections[0].exercises).toHaveLength(2)
    expect(sections[0].exercises[0].name).toBe('Squat')
  })

  it('formats sets as "10 reps" when only reps are set', () => {
    const sections = buildProgramPdfSections([makeWorkout('Day 1', ['Squat'])])
    expect(sections[0].exercises[0].setsSummary).toBe('10 reps')
  })

  it('returns empty array for program with no workouts', () => {
    expect(buildProgramPdfSections([])).toEqual([])
  })
})
