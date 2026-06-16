export interface WeekPlan {
  week: number
  title: string
  rehabStage: 'EARLY_REHAB' | 'MID_REHAB' | 'LATE_REHAB' | 'MAINTENANCE'
  focusAreas: string[]
  difficultyLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  clinicalGuidance: string
  contraindicationsThisWeek: string[]
  progressionGoal: string
  derivedIndicationTags: string[]
}

export interface ClinicalPlan {
  clinicalAssessment: string
  weeklyPlan: WeekPlan[]
}

export interface ClinicalPlanParams {
  patientId?: string | null
  programGoals: string[]
  availableEquipment?: string[]
  durationWeeks: number
  daysPerWeek: number
  difficultyLevel: string
  circuits: {
    name: string
    focusType: string
    exerciseCount: number
    rounds: number
    restBetweenRounds: number | null
  }[]
  preferredWeekdays?: string[]
  subjective?: string
  clinicianPrompt?: string
  additionalNotes?: string
}
