export type SetLogEntry = {
  actualReps?: number;
  actualWeight?: number;
  actualDuration?: number;
  actualRPE?: number;
  completed: boolean;
};

// blockExerciseId -> setIndex -> entry
export type SetLogCache = Record<string, Record<number, SetLogEntry>>;
