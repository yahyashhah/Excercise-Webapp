export const ROUTES = {
  HOME: "/",
  SIGN_IN: "/sign-in",
  SIGN_UP: "/sign-up",
  ONBOARDING: "/onboarding",
  DASHBOARD: "/dashboard",
  EXERCISES: "/exercises",
  EXERCISE_DETAIL: (id: string) => `/exercises/${id}`,
  EXERCISE_NEW: "/exercises/new",
  PROGRAMS: "/programs",
  PROGRAM_DETAIL: (id: string) => `/programs/${id}`,
  PROGRAM_EDIT: (id: string) => `/programs/${id}/edit`,
  PROGRAM_NEW: "/programs/new",
  WORKOUT_PLANS: "/workout-plans",
  WORKOUT_PLAN_DETAIL: (id: string) => `/workout-plans/${id}`,
  WORKOUT_PLAN_EDIT: (id: string) => `/workout-plans/${id}/edit`,
  WORKOUT_PLAN_SESSION: (id: string) => `/workout-plans/${id}/session`,
  WORKOUT_PLAN_GENERATE: "/workout-plans/generate",
  PATIENTS: "/patients",
  PATIENT_DETAIL: (id: string) => `/patients/${id}`,
  PATIENT_ADHERENCE: (id: string) => `/patients/${id}/adherence`,
  PATIENT_OUTCOMES: (id: string) => `/patients/${id}/outcomes`,
  MESSAGES: "/messages",
  MESSAGE_THREAD: (id: string) => `/messages/${id}`,
  ASSESSMENTS: "/assessments",
  ASSESSMENT_NEW: "/assessments/new",
  SETTINGS: "/settings",
} as const;

export const BODY_REGIONS = [
  { value: "LOWER_BODY", label: "Lower Body" },
  { value: "UPPER_BODY", label: "Upper Body" },
  { value: "CORE", label: "Core" },
  { value: "FULL_BODY", label: "Full Body" },
  { value: "BALANCE", label: "Balance" },
  { value: "FLEXIBILITY", label: "Flexibility" },
] as const;

export const DIFFICULTY_LEVELS = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
] as const;

export const PLAN_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
] as const;

export const FEEDBACK_RATINGS = [
  { value: "FELT_GOOD", label: "Felt Good" },
  { value: "MILD_DISCOMFORT", label: "Mild Discomfort" },
  { value: "PAINFUL", label: "Painful" },
  { value: "UNSURE_HOW_TO_PERFORM", label: "Unsure How to Perform" },
] as const;

export const USER_ROLES = [
  { value: "CLINICIAN", label: "Clinician" },
  { value: "PATIENT", label: "Patient" },
] as const;

export const COMMON_EQUIPMENT = [
  "None",
  "Resistance Band",
  "Dumbbells",
  "Yoga Mat",
  "Stability Ball",
  "Foam Roller",
  "Chair",
  "Wall",
  "Towel",
  "Step/Stair",
] as const;

export const FITNESS_GOALS = [
  "Reduce Pain",
  "Improve Mobility",
  "Build Strength",
  "Improve Balance",
  "Increase Flexibility",
  "Post-Surgery Recovery",
  "Injury Prevention",
  "Daily Function Improvement",
] as const;

export const ASSESSMENT_TYPES = [
  { value: "pain_level", label: "Pain Level", unit: "/10" },
  { value: "range_of_motion", label: "Range of Motion", unit: "degrees" },
  { value: "strength", label: "Strength", unit: "/5" },
  { value: "balance", label: "Balance", unit: "seconds" },
  { value: "flexibility", label: "Flexibility", unit: "cm" },
  { value: "functional_score", label: "Functional Score", unit: "/100" },
] as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
