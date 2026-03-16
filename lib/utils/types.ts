import type {
  User,
  Exercise,
  WorkoutPlan,
  PlanExercise,
  ExerciseFeedback,
  WorkoutSession,
  SessionExercise,
  Assessment,
  Message,
  PatientProfile,
  ExerciseMedia,
  ExerciseProgression,
} from "@prisma/client";

// Extended types with relations
export type ExerciseWithMedia = Exercise & {
  media: ExerciseMedia[];
};

export type ExerciseWithProgressions = Exercise & {
  media: ExerciseMedia[];
  progressionsFrom: (ExerciseProgression & { nextExercise: Exercise })[];
  progressionsTo: (ExerciseProgression & { exercise: Exercise })[];
};

export type PlanExerciseWithExercise = PlanExercise & {
  exercise: Exercise;
};

export type PlanWithExercises = WorkoutPlan & {
  exercises: PlanExerciseWithExercise[];
};

export type PlanWithDetails = WorkoutPlan & {
  exercises: PlanExerciseWithExercise[];
  patient: User;
  createdBy: User;
  _count: { sessions: number };
};

export type FeedbackWithDetails = ExerciseFeedback & {
  planExercise: PlanExercise & { exercise: Exercise };
  patient: User;
};

export type SessionWithExercises = WorkoutSession & {
  exercises: (SessionExercise & {
    planExercise: PlanExercise & { exercise: Exercise };
  })[];
  plan: WorkoutPlan;
};

export type MessageWithUsers = Message & {
  sender: User;
  recipient: User;
};

export type PatientWithProfile = User & {
  patientProfile: PatientProfile | null;
};

export type InboxThread = {
  otherUser: User;
  lastMessage: Message;
  unreadCount: number;
};

// Action response types
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export type ActionResultVoid =
  | { success: true }
  | { success: false; error: string };
