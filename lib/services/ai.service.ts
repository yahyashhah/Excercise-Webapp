import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import type { BodyRegion } from "@prisma/client";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface CircuitConfig {
  name: string;
  focusType: string;
  exerciseCount: number;
}

interface GenerateWorkoutParams {
  patientId?: string | null;
  focusAreas: string[];
  durationMinutes: number;
  daysPerWeek: number;
  /** Per-circuit configuration — preferred over exercisesPerSession/circuitsPerSession */
  circuits?: CircuitConfig[];
  /** @deprecated Use circuits instead */
  exercisesPerSession?: number;
  /** @deprecated Use circuits instead */
  circuitsPerSession?: number;
  difficultyLevel: string;
  additionalNotes?: string;
  subjective?: string;
  clinicianPrompt?: string;
  programTitle?: string;
  preferredWeekdays?: string[];
  preferredExerciseNames?: string[];
  sessionBlueprint?: {
    dayIndex: number;
    weekIndex?: number;
    title: string;
    blocks: {
      name: string;
      sets?: number;
      exercises: { name: string; sets?: number; reps?: number; durationSeconds?: number }[];
    }[];
  }[];
}

interface GeneratedExercise {
  exerciseId: string;
  exerciseName: string;
  phase: string;
  circuitIndex?: number;
  sets: number;
  reps?: number;
  durationSeconds?: number;
  restSeconds?: number;
  weekIndex?: number;
  dayOfWeek?: number;
  orderIndex: number;
  notes?: string;
}

interface GeneratedPlan {
  title: string;
  description: string;
  sessions: { dayOfWeek: number; weekIndex?: number; name: string }[];
  exercises: GeneratedExercise[];
}

/** Map user-facing focus area strings to BodyRegion enum values */
function mapFocusAreasToBodyRegions(focusAreas: string[]): BodyRegion[] {
  const mapping: Record<string, BodyRegion> = {
    lower: "LOWER_BODY",
    "lower body": "LOWER_BODY",
    lower_body: "LOWER_BODY",
    leg: "LOWER_BODY",
    legs: "LOWER_BODY",
    hip: "LOWER_BODY",
    knee: "LOWER_BODY",
    ankle: "LOWER_BODY",
    upper: "UPPER_BODY",
    "upper body": "UPPER_BODY",
    upper_body: "UPPER_BODY",
    arm: "UPPER_BODY",
    arms: "UPPER_BODY",
    shoulder: "UPPER_BODY",
    wrist: "UPPER_BODY",
    core: "CORE",
    abdominal: "CORE",
    back: "CORE",
    "lower back": "CORE",
    balance: "BALANCE",
    flexibility: "FLEXIBILITY",
    stretch: "FLEXIBILITY",
    stretching: "FLEXIBILITY",
    "full body": "FULL_BODY",
    full_body: "FULL_BODY",
    general: "FULL_BODY",
  };

  const regions = new Set<BodyRegion>();
  for (const area of focusAreas) {
    const lower = area.toLowerCase().trim();
    if (mapping[lower]) {
      regions.add(mapping[lower]);
    }
    // Also check partial matches
    for (const [key, region] of Object.entries(mapping)) {
      if (lower.includes(key) || key.includes(lower)) {
        regions.add(region);
      }
    }
  }

  // If no mapping found, return all regions
  if (regions.size === 0) {
    return [
      "LOWER_BODY",
      "UPPER_BODY",
      "CORE",
      "FULL_BODY",
      "BALANCE",
      "FLEXIBILITY",
    ];
  }

  return Array.from(regions);
}

/** Phase ordering for post-processing */
const PHASE_ORDER: Record<string, number> = {
  WARMUP: 0,
  ACTIVATION: 1,
  STRENGTHENING: 2,
  MOBILITY: 3,
  COOLDOWN: 4,
};

function normalizeExerciseName(name: string) {
  return name
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreNameSimilarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  let overlap = 0;
  for (const t of aTokens) if (bTokens.has(t)) overlap += 1;
  return overlap / Math.max(1, Math.max(aTokens.size, bTokens.size));
}

async function pickClosestExerciseNameAI(
  target: string,
  candidates: string[]
) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 400,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Select the single closest exercise name from the candidate list. Return JSON: { \"bestName\": string }. No extra text.",
      },
      {
        role: "user",
        content: `Target: ${target}\nCandidates:\n${candidates.join("\n")}`,
      },
    ],
  });

  const payload = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(payload) as { bestName?: string };
  return parsed.bestName || "";
}

export async function generateWorkoutPlan(
  params: GenerateWorkoutParams
): Promise<GeneratedPlan> {
  const weekdayToIndex: Record<string, number> = {
    monday: 0,
    tuesday: 1,
    wednesday: 2,
    thursday: 3,
    friday: 4,
    saturday: 5,
    sunday: 6,
  };
  const indexToWeekday = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  const preferredWeekdayIndices =
    params.preferredWeekdays
      ?.map((d) => weekdayToIndex[d.toLowerCase().trim()])
      .filter((d): d is number => Number.isInteger(d)) ?? [];

  const effectiveWeekdayIndices =
    preferredWeekdayIndices.length > 0
      ? preferredWeekdayIndices
      : Array.from(
          { length: Math.max(1, Math.min(params.daysPerWeek, 7)) },
          (_, idx) => idx
        );

  const uniqueWeekdayIndices = Array.from(new Set(effectiveWeekdayIndices)).sort(
    (a, b) => a - b
  );

  const scheduleLabel = uniqueWeekdayIndices
    .map((i) => indexToWeekday[i])
    .join(", ");

  // Fetch client profile for context
  const patient = params.patientId
    ? await prisma.user.findUnique({
        where: { id: params.patientId },
        include: { patientProfile: true },
      })
    : null;

  const profile = patient?.patientProfile ?? null;

  // Map focus areas to body regions for pre-filtering
  const targetRegions = mapFocusAreasToBodyRegions(params.focusAreas);

  // Parse patient limitations for contraindication filtering
  const patientLimitations = profile?.limitations
    ? profile.limitations
        .toLowerCase()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  // Fetch exercises with enriched fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allExercises = (await (prisma.exercise.findMany as any)({
    where: {
      isActive: true,
      bodyRegion: { in: targetRegions },
    },
    select: {
      id: true,
      name: true,
      bodyRegion: true,
      difficultyLevel: true,
      equipmentRequired: true,
      contraindications: true,
      description: true,
      musclesTargeted: true,
      exercisePhase: true,
      commonMistakes: true,
      defaultSets: true,
      defaultReps: true,
      defaultHoldSeconds: true,
      cuesThumbnail: true,
      videoUrl: true,
    },
  })) as Array<{
    id: string;
    name: string;
    bodyRegion: string;
    difficultyLevel: string;
    equipmentRequired: string[];
    contraindications: string[];
    description: string | null;
    musclesTargeted: string[];
    exercisePhase: string | null;
    commonMistakes: string | null;
    defaultSets: number | null;
    defaultReps: number | null;
    defaultHoldSeconds: number | null;
    cuesThumbnail: string | null;
    videoUrl: string | null;
  }>;

  // Filter out exercises with contraindication overlap
  const filtered = allExercises.filter((exercise) => {
    if (patientLimitations.length === 0) return true;
    const contraLower = exercise.contraindications.map((c) => c.toLowerCase());
    return !patientLimitations.some((limitation) =>
      contraLower.some(
        (contra) =>
          contra.includes(limitation) || limitation.includes(contra)
      )
    );
  });

  let filteredForBrief = filtered;
  const preferredNames = (params.preferredExerciseNames || [])
    .map((n) => n.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
    .filter(Boolean);

  if (preferredNames.length) {
    filteredForBrief = filtered.filter((e) => {
      const exerciseName = e.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!exerciseName) return false;
      return preferredNames.some(
        (n) => exerciseName === n || exerciseName.includes(n) || n.includes(exerciseName)
      );
    });
  }

  // Pool must be large enough so the AI can pick unique exercises across all days
  const exercisesPerSession = params.circuits?.length
    ? params.circuits.reduce((sum, c) => sum + c.exerciseCount, 0)
    : (params.exercisesPerSession ?? 15);
  const exercisePoolLimit = Math.max(80, params.daysPerWeek * exercisesPerSession);
  const exercises = filteredForBrief.slice(0, exercisePoolLimit);

  if (exercises.length === 0) {
    throw new Error(
      preferredNames.length
        ? "No exercises from the brief matched your library. Please check exercise names."
        : "No suitable exercises found for the given focus areas and patient profile."
    );
  }

  if (params.sessionBlueprint?.length) {
    const circuits = params.circuits || [];
    const circuitNameMap = new Map(
      circuits.map((c, idx) => [normalizeExerciseName(c.name), idx])
    );

    const allBriefExercises = await prisma.exercise.findMany({
      where: { isActive: true },
    });

    async function resolveExerciseByName(name: string) {
      const normalizedTarget = normalizeExerciseName(name);
      const exact = allBriefExercises.find(
        (e) => normalizeExerciseName(e.name) === normalizedTarget
      );
      if (exact) return exact;

      const ranked = allBriefExercises
        .map((e) => ({
          exercise: e,
          score: scoreNameSimilarity(normalizeExerciseName(e.name), normalizedTarget),
        }))
        .sort((a, b) => b.score - a.score);

      if (!ranked.length) return null;

      const top = ranked.slice(0, 20).map((r) => r.exercise.name);
      const aiPick = await pickClosestExerciseNameAI(name, top);
      const best = allBriefExercises.find((e) => e.name === aiPick);
      return best ?? ranked[0].exercise;
    }

    // Map per-week dayIndex (0,1,2) → actual weekday index using preferredWeekdays
    // e.g. ["Monday","Wednesday","Friday"] → [0,2,4], so dayIndex 1 → Wednesday (2) not Tuesday (1)
    const preferredDayIndices = (params.preferredWeekdays ?? [])
      .map((d) => weekdayToIndex[d.toLowerCase().trim()])
      .filter((d): d is number => Number.isInteger(d));

    function toActualDayOfWeek(dayIndex: number): number {
      if (preferredDayIndices.length === 0) return dayIndex;
      return preferredDayIndices[dayIndex % preferredDayIndices.length];
    }

    const sessions = params.sessionBlueprint.map((s) => ({
      dayOfWeek: toActualDayOfWeek(s.dayIndex),
      weekIndex: s.weekIndex ?? 0,
      name: s.title,
    }));

    const exercisesOutput: GeneratedExercise[] = [];

    for (const session of params.sessionBlueprint) {
      let orderIndex = 0;
      for (let blockIdx = 0; blockIdx < session.blocks.length; blockIdx += 1) {
        const block = session.blocks[blockIdx];
        const blockKey = normalizeExerciseName(block.name);
        const circuitIndex =
          circuitNameMap.get(blockKey) ?? Math.min(blockIdx, Math.max(0, circuits.length - 1));

        for (const exerciseBp of block.exercises) {
          const exercise = await resolveExerciseByName(exerciseBp.name);
          if (!exercise) {
            console.warn(`[Brief] No exercises in library, skipping: ${exerciseBp.name}`);
            continue;
          }

          // Prefer sets/reps from the brief; fall back to library defaults
          const sets = exerciseBp.sets ?? exercise.defaultSets ?? 3;
          const hasDuration =
            exerciseBp.durationSeconds != null ||
            (exerciseBp.reps == null && exercise.defaultHoldSeconds != null);
          const reps = hasDuration ? undefined : (exerciseBp.reps ?? exercise.defaultReps ?? 10);
          const durationSeconds =
            exerciseBp.durationSeconds ??
            (hasDuration ? (exercise.defaultHoldSeconds ?? undefined) : undefined);

          const focusType = circuits[circuitIndex]?.focusType?.toUpperCase();
          const phase =
            focusType === "WARMUP"
              ? "WARMUP"
              : focusType === "COOLDOWN"
                ? "COOLDOWN"
                : focusType === "FLEXIBILITY"
                  ? "MOBILITY"
                  : focusType === "CARDIO"
                    ? "ACTIVATION"
                    : focusType === "BALANCE"
                      ? "ACTIVATION"
                      : "STRENGTHENING";

          exercisesOutput.push({
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            phase,
            circuitIndex,
            sets,
            reps,
            durationSeconds,
            restSeconds: undefined,
            weekIndex: session.weekIndex ?? 0,
            dayOfWeek: toActualDayOfWeek(session.dayIndex),
            orderIndex: orderIndex++,
            notes: undefined,
          });
        }
      }
    }

    const programTitle =
      params.programTitle ||
      params.clinicianPrompt?.split("\n")?.[0]?.replace(/^Program title:\s*/i, "").trim() ||
      "Athletic Program";

    return {
      title: programTitle,
      description: "Generated from uploaded brief",
      sessions,
      exercises: exercisesOutput,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileExtended = profile as any;

  function calculateWeeksSince(date: Date): number {
    return Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 7));
  }

  const systemPrompt = `You are an expert exercise professional with deep knowledge in physical therapy, strength & conditioning, athletic performance, and general fitness. Create structured exercise programs that adapt to any program context — rehabilitation, athletic development, sports performance, or general fitness.

PROGRAM DESIGN RULES:
1. STRUCTURE each session with phases appropriate to the program type. For rehab: Warm-up → Activation → Therapeutic work → Mobility → Cool-down. For athletic/performance: Dynamic warm-up → Power/Plyometrics → Strength work → Conditioning → Recovery. For general fitness: Warm-up → Main work → Cool-down.
2. SELECT exercises that match the stated focus areas, difficulty level, and any documented limitations or contraindications. Never prescribe an exercise that directly conflicts with listed contraindications.
3. EQUIPMENT: Use only exercises matching available equipment; default to bodyweight if none stated.
4. VOLUME: Scale to difficulty — BEGINNER: 2-3 sets; INTERMEDIATE: 3-4 sets; ADVANCED: 4-5 sets. Follow any explicit set/rep prescriptions in the clinician instructions.
5. VARIETY: Minimize exercise repetition across days. If the pool is too small, reuse only after a 2-day gap — never on consecutive days.
6. SESSION NAMES: Use concise, descriptive names that reflect the actual training focus (e.g. "Lower Body Power", "Upper Body Pull", "Plyometric Development", "Mobility & Recovery") — not generic labels.
7. NOTES: Write 1-2 specific technique cues per exercise relevant to the program goal and client profile.
8. TIME: Total session time within 5 minutes of the requested duration.
9. GENERATE exercises for ALL ${params.daysPerWeek} days — do not stop after the first day.
10. CONTEXT-DRIVEN: If a diagnosis or subjective is provided, let it guide exercise selection and cue language. If athletic performance context is implied (plyometrics, power, sport-specific), adopt strength & conditioning principles rather than clinical rehab rules.

Respond with valid JSON only. No markdown, no explanation.`;

  const clientContext = patient
    ? `CLIENT PROFILE:
Name: ${patient.firstName} ${patient.lastName}
Primary Diagnosis / Goal: ${profileExtended?.primaryDiagnosis ?? "Not specified"}
Secondary Conditions: ${profileExtended?.secondaryDiagnoses?.length ? profileExtended.secondaryDiagnoses.join(", ") : "None"}
Current Pain Score: ${profileExtended?.painScore != null ? `${profileExtended.painScore}/10` : "Not assessed"}
Activity Level: ${profileExtended?.activityLevel ?? "Not assessed"}
Physical Limitations: ${profile?.limitations ?? "None documented"}
Comorbidities: ${profile?.comorbidities ?? "None"}
Functional Challenges: ${profile?.functionalChallenges ?? "None"}
History: ${profileExtended?.surgeryHistory ?? "None documented"}
Occupation: ${profileExtended?.occupation ?? "Not specified"}
Time Since Injury/Surgery: ${profileExtended?.injuryDate ? calculateWeeksSince(new Date(profileExtended.injuryDate)) + " weeks ago" : "Not specified"}
Prior Injuries: ${profileExtended?.priorInjuries?.length ? profileExtended.priorInjuries.join(", ") : "None"}
Available Equipment: ${profile?.availableEquipment?.length ? profile.availableEquipment.join(", ") : "Bodyweight only"}
Goals: ${profile?.fitnessGoals?.length ? profile.fitnessGoals.join(", ") : "General fitness"}`
    : "No specific client assigned. Create a general program suitable for the parameters below.";

  const exerciseListStr = exercises
    .map(
      (e) =>
        `ID: ${e.id} | ${e.name} | Phase: ${e.exercisePhase ?? "STRENGTHENING"} | Region: ${e.bodyRegion} | Difficulty: ${e.difficultyLevel} | Muscles: ${e.musclesTargeted.join(", ")} | Equipment: ${e.equipmentRequired.join(", ") || "None"} | Video: ${e.videoUrl ? "Yes" : "No"} | Default Rx: ${e.defaultSets ?? 3}x${e.defaultReps ? e.defaultReps : e.defaultHoldSeconds ? e.defaultHoldSeconds + "s hold" : "10"} | Mistakes: ${e.commonMistakes || "N/A"} | Cues: ${e.cuesThumbnail || "N/A"}`
    )
    .join("\n");

  const circuits = params.circuits;
  const hasCircuits = circuits && circuits.length > 0;

  const totalExercisesPerSession = hasCircuits
    ? circuits.reduce((sum, c) => sum + c.exerciseCount, 0)
    : (params.exercisesPerSession ?? 6);

  const circuitStructureStr = hasCircuits
    ? circuits
        .map(
          (c, i) =>
            `  Circuit ${i} "${c.name}" (${c.focusType} focus): EXACTLY ${c.exerciseCount} exercise${c.exerciseCount !== 1 ? "s" : ""} PER SESSION/DAY`
        )
        .join("\n")
    : null;

  const userPrompt = `Create an exercise program with the following details:

${clientContext}

Program Parameters:
- Focus Areas: ${params.focusAreas.join(", ")}
- Duration: ~${params.durationMinutes} minutes per session
- Days per Week: ${params.daysPerWeek}
- Difficulty Level: ${params.difficultyLevel}
- Allowed Weekdays: ${scheduleLabel} (${uniqueWeekdayIndices.join(", ")})
- Total Exercises Per Session: EXACTLY ${totalExercisesPerSession}
${hasCircuits ? `- Circuit Structure (EXACT — follow precisely):\n${circuitStructureStr}` : `- Circuits / Supersets: ${(params.circuitsPerSession ?? 0) === 0 ? "None — use straight sets only" : `${params.circuitsPerSession} circuit block(s) per session`}`}
${params.subjective ? `- Clinician Subjective: ${params.subjective}` : ""}
${params.clinicianPrompt ? `- Clinician Instructions: ${params.clinicianPrompt}` : ""}
${params.additionalNotes ? `- Additional Notes: ${params.additionalNotes}` : ""}

${hasCircuits ? `CIRCUIT ASSIGNMENT RULES (CRITICAL):
- Each exercise MUST include "circuitIndex" set to its 0-based circuit number (0, 1, 2, ...).
- Each circuit count is PER SESSION — every training day must have the FULL circuit exercise count, not a fraction of it.
- Example: if Circuit 0 requires 4 exercises and there are ${params.daysPerWeek} days, you must output 4 exercises with circuitIndex=0 for EACH day (${params.daysPerWeek * (circuits?.[0]?.exerciseCount ?? 0)} total for that circuit across all days).
- Total exercises in the "exercises" array must be EXACTLY ${totalExercisesPerSession * params.daysPerWeek} (${totalExercisesPerSession} per session × ${params.daysPerWeek} days).
- Circuit focus guidelines for exercise selection:
  WARMUP → lightweight warm-up, joint mobility, gentle activation (prefer exercisePhase: WARMUP or ACTIVATION)
  LOWER_BODY → lower limb strength — quad, hamstring, glute, calf focus (bodyRegion: LOWER_BODY)
  UPPER_BODY → shoulder, arm, chest, upper back exercises (bodyRegion: UPPER_BODY)
  CORE → core stability, lumbar, abdominal (bodyRegion: CORE)
  FULL_BODY → compound multi-joint or functional movement exercises
  BALANCE → proprioception, single-leg stability, vestibular
  FLEXIBILITY → static stretch, PNF, foam rolling (prefer exercisePhase: MOBILITY)
  COOLDOWN → gentle cooldown, static stretch, breathing (prefer exercisePhase: COOLDOWN or MOBILITY)
  CARDIO → cardiovascular conditioning, sustained effort exercises` : `CRITICAL VOLUME RULE: Each day must have EXACTLY ${totalExercisesPerSession} exercises — no more, no less. Distribute them across the required phases (WARMUP → ACTIVATION → STRENGTHENING → MOBILITY → COOLDOWN).`}

Available Exercises (use ONLY these exercise IDs):
${exerciseListStr}

Respond with this exact JSON structure:
{
  "title": "Program title",
  "description": "2-3 sentence clinical program description",
  "sessions": [
    { "dayOfWeek": 0, "name": "A short clinical session name, e.g. 'Hip Activation & Mobility' or 'Posterior Chain Strengthening'" }
  ],
  "exercises": [
    {
      "exerciseId": "the exercise ID from the list above",
      "exerciseName": "exercise name",
      "phase": "ACTIVATION",
      ${hasCircuits ? `"circuitIndex": 0,` : ""}
      "sets": 3,
      "reps": 15,
      "durationSeconds": null,
      "restSeconds": 30,
      "dayOfWeek": 0,
      "orderIndex": 2,
      "notes": "2-3 clinical form cues specific to this patient"
    }
  ]
}

Each entry in "sessions" must have one entry per unique dayOfWeek used in exercises. The session name should reflect the actual focus of that day's exercises (e.g. body region, dominant phase, clinical goal) — not a generic label.

Rules:
1. ONLY use exercise IDs from the list provided
2. Respect patient limitations and contraindications
3. Match the difficulty level requested
4. Distribute exercises across ${params.daysPerWeek} days using ONLY these weekday indexes: ${uniqueWeekdayIndices.join(", ")}
5. Keep total session time around ${params.durationMinutes} minutes
6. Use either reps OR durationSeconds per exercise, not both (set unused to null)
${hasCircuits ? `7. Assign "circuitIndex" to every exercise — it MUST match one of the circuit indexes (0 through ${circuits.length - 1})
8. Every day must have EXACTLY ${totalExercisesPerSession} exercises total, with EXACTLY the specified count per circuit — DO NOT split or distribute a circuit's count across days; repeat the full circuit on each day
9. Let the clinician instructions and subjective guide exercise selection, cue language, and loading strategy` : `7. Follow the phase ordering appropriate to the program type
8. Let the clinician instructions and subjective guide exercise selection, cue language, and loading strategy`}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 16000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const responseText = response.choices[0].message.content ?? "";
  const parsed = JSON.parse(responseText) as GeneratedPlan;

  // Validate that all exercise IDs exist
  const exerciseIds = new Set(exercises.map((e) => e.id));
  const validExercises = parsed.exercises.filter((e) =>
    exerciseIds.has(e.exerciseId)
  );

  if (validExercises.length === 0) {
    throw new Error("AI generated no valid exercises. Please try again.");
  }

  // Post-processing: sort exercises per day by phase order
  const sortedExercises = [...validExercises].sort((a, b) => {
    // First sort by day
    const dayA = a.dayOfWeek ?? 0;
    const dayB = b.dayOfWeek ?? 0;
    if (dayA !== dayB) return dayA - dayB;

    // Then by phase order
    const phaseA = PHASE_ORDER[a.phase] ?? 2;
    const phaseB = PHASE_ORDER[b.phase] ?? 2;
    if (phaseA !== phaseB) return phaseA - phaseB;

    // Then by original orderIndex
    return a.orderIndex - b.orderIndex;
  });

  // Reassign orderIndex after sorting
  let currentDay = -1;
  let dayOrder = 0;
  for (const exercise of sortedExercises) {
    const day = exercise.dayOfWeek ?? 0;
    if (day !== currentDay) {
      currentDay = day;
      dayOrder = 0;
    }
    exercise.orderIndex = dayOrder++;
  }

  // Detect cross-day duplicates (log but allow)
  const allUsedIds = sortedExercises.map((e) => e.exerciseId);
  const duplicateIds = allUsedIds.filter(
    (id, i) => allUsedIds.indexOf(id) !== i
  );
  if (duplicateIds.length > 0) {
    console.warn(
      `[AI] Cross-day duplicate exercises detected: ${[...new Set(duplicateIds)].join(", ")}`
    );
  }

  return {
    ...parsed,
    exercises: sortedExercises,
  };
}


export interface GeneratedProgramWorkoutBlock {
  type: string;
  name?: string;
  circuitIndex?: number;
  orderIndex: number;
  exercises: {
    exerciseId: string;
    exerciseName?: string;
    orderIndex: number;
    sets: number;
    reps: string;
    notes?: string;
    restSeconds?: number;
  }[];
}

export interface GeneratedProgramWorkout {
  name: string;
  dayIndex: number;
  weekIndex: number;
  blocks: GeneratedProgramWorkoutBlock[];
}

export interface GeneratedProgram {
  name: string;
  description?: string;
  workouts: GeneratedProgramWorkout[];
}

function circuitFocusToBlockType(focusType: string): string {
  if (focusType === "WARMUP") return "WARMUP";
  if (focusType === "COOLDOWN") return "COOLDOWN";
  return "CIRCUIT";
}

export async function generateProgram(
  params: GenerateWorkoutParams
): Promise<GeneratedProgram> {
  const generatedPlan = await generateWorkoutPlan(params);

  const circuits = params.circuits;
  const hasCircuits = circuits && circuits.length > 0;

  const sessionNameMap = new Map<string, string>(
    (generatedPlan.sessions ?? []).map((s) => [`${s.weekIndex ?? 0}_${s.dayOfWeek}`, s.name])
  );

  const workoutsMap = new Map<string, GeneratedProgramWorkout>();

  generatedPlan.exercises.forEach((ex) => {
    const day = ex.dayOfWeek ?? 0;
    const week = ex.weekIndex ?? 0;
    const key = `${week}_${day}`;
    if (!workoutsMap.has(key)) {
      const sessionNum = workoutsMap.size;
      const name = sessionNameMap.get(key);
      if (!name) {
        console.warn(`[AI] No session name returned for week ${week} day ${day} — using fallback`);
      }
      workoutsMap.set(key, {
        name: name ?? `Session ${sessionNum + 1}`,
        dayIndex: day,
        weekIndex: week,
        blocks: [],
      });
    }
    const workout = workoutsMap.get(key)!;

    if (hasCircuits) {
      // Group by circuitIndex from the AI output
      const circuitIdx = Math.max(
        0,
        Math.min(ex.circuitIndex ?? 0, circuits.length - 1)
      );
      const circuitConfig = circuits[circuitIdx];

      let block = workout.blocks.find((b) => b.circuitIndex === circuitIdx);
      if (!block) {
        block = {
          type: circuitFocusToBlockType(circuitConfig.focusType),
          name: circuitConfig.name,
          circuitIndex: circuitIdx,
          orderIndex: circuitIdx,
          exercises: [],
        };
        workout.blocks.push(block);
      }

      block.exercises.push({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        orderIndex: block.exercises.length,
        sets: ex.sets || 3,
        reps: ex.reps != null
          ? ex.reps.toString()
          : ex.durationSeconds != null
            ? `${ex.durationSeconds}s`
            : "10",
        notes: ex.notes,
        restSeconds: ex.restSeconds,
      });
    } else {
      // Legacy: group by phase
      let targetType = ex.phase.toUpperCase();
      if (["ACTIVATION", "STRENGTHENING", "MOBILITY"].includes(targetType)) {
        targetType = "NORMAL";
      }

      let block = workout.blocks.find((b) => b.type === targetType && b.circuitIndex === undefined);
      if (!block) {
        block = {
          type: ["WARMUP", "COOLDOWN", "SUPERSET", "CIRCUIT", "AMRAP", "EMOM"].includes(targetType) ? targetType : "NORMAL",
          orderIndex: workout.blocks.length,
          exercises: [],
        };
        workout.blocks.push(block);
      }

      block.exercises.push({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        orderIndex: block.exercises.length,
        sets: ex.sets || 3,
        reps: ex.reps?.toString() || "10",
        notes: ex.notes,
        restSeconds: ex.restSeconds,
      });
    }
  });

  // Ensure blocks are sorted by orderIndex within each workout
  for (const workout of workoutsMap.values()) {
    workout.blocks.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  const workouts = Array.from(workoutsMap.values()).sort((a, b) => {
    if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
    return a.dayIndex - b.dayIndex;
  });

  return {
    name: generatedPlan.title || "AI Generated Program",
    description: generatedPlan.description,
    workouts,
  };
}
