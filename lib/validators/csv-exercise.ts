import { z } from "zod";

const BODY_REGIONS = ["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"] as const;
const DIFFICULTY_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
const EXERCISE_PHASES = ["WARMUP", "ACTIVATION", "STRENGTHENING", "MOBILITY", "COOLDOWN"] as const;

function emptyToUndefined(v: unknown): unknown {
  return typeof v === "string" && v.trim() === "" ? undefined : v;
}

function coerceInt(v: unknown): unknown {
  if (v === "" || v === undefined || v === null) return undefined;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? v : n;
}

export const csvRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(2000).optional()),
  bodyRegion: z.enum(BODY_REGIONS),
  difficultyLevel: z.enum(DIFFICULTY_LEVELS),
  exercisePhase: z.preprocess(emptyToUndefined, z.enum(EXERCISE_PHASES).optional()),
  musclesTargeted: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  equipmentRequired: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  contraindications: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  instructions: z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional()),
  commonMistakes: z.preprocess(emptyToUndefined, z.string().trim().max(2000).optional()),
  defaultSets: z.preprocess(coerceInt, z.number().int().min(1).max(10).optional()),
  defaultReps: z.preprocess(coerceInt, z.number().int().min(1).max(60).optional()),
  defaultHoldSeconds: z.preprocess(coerceInt, z.number().int().min(1).optional()),
  cuesThumbnail: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  indicationTags: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  rehabStage: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  videoUrl: z.preprocess(emptyToUndefined, z.string().url("Must be a valid URL").optional()),
});

export type CsvExerciseRow = z.infer<typeof csvRowSchema>;

export interface CsvRowError {
  row: number;
  column: string;
  message: string;
}

export interface CsvValidationResult {
  valid: CsvExerciseRow[];
  errors: CsvRowError[];
}

export function validateCsvRows(rawRows: Record<string, string>[]): CsvValidationResult {
  const valid: CsvExerciseRow[] = [];
  const errors: CsvRowError[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const result = csvRowSchema.safeParse(rawRows[i]);
    if (result.success) {
      valid.push(result.data);
    } else {
      for (const issue of result.error.issues) {
        errors.push({
          row: i + 2, // +1 for 0-index, +1 because row 1 is the header
          column: String(issue.path[0] ?? "unknown"),
          message: issue.message,
        });
      }
    }
  }

  return { valid, errors };
}
