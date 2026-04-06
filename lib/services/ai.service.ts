import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import type { BodyRegion } from "@prisma/client";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface GenerateWorkoutParams {
  patientId?: string | null;
  focusAreas: string[];
  durationMinutes: number;
  daysPerWeek: number;
  difficultyLevel: string;
  additionalNotes?: string;
}

interface GeneratedExercise {
  exerciseId: string;
  exerciseName: string;
  phase: string;
  sets: number;
  reps?: number;
  durationSeconds?: number;
  restSeconds?: number;
  dayOfWeek?: number;
  orderIndex: number;
  notes?: string;
}

interface GeneratedPlan {
  title: string;
  description: string;
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

export async function generateWorkoutPlan(
  params: GenerateWorkoutParams
): Promise<GeneratedPlan> {
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

  // Limit to 60 exercises max to control token usage
  const exercises = filtered.slice(0, 60);

  if (exercises.length === 0) {
    throw new Error(
      "No suitable exercises found for the given focus areas and patient profile."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileExtended = profile as any;

  function calculateWeeksSince(date: Date): number {
    return Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 7));
  }

  const systemPrompt = `You are a licensed rehabilitation specialist (PT, DPT) creating evidence-based Home Exercise Programs (HEPs) for clinical use. Follow APTA and evidence-based rehabilitation standards.

CLINICAL PRESCRIPTION RULES:
1. PHASE ORDERING is mandatory every session: WARMUP (1-2 exercises) → ACTIVATION (1-2 exercises) → STRENGTHENING (2-4 exercises) → MOBILITY (1-2 exercises) → COOLDOWN (1 exercise).
2. DIAGNOSIS-SPECIFIC SELECTION: When a diagnosis is provided, prioritize exercises that target the specific impairments. Post-surgical: gentle activation and protected mobility. Chronic pain: graded exposure, avoid provocative positions. Neurological: motor control and balance focus.
3. PAIN SCORE ADJUSTMENT: Pain 7-10/10 → gentle non-aggravating exercises only, fewer sets. Pain 4-6/10 → moderate intensity, monitor. Pain 0-3/10 → full program at prescribed difficulty.
4. ABSOLUTE CONTRAINDICATION COMPLIANCE: Zero tolerance — NEVER prescribe exercises with a matching contraindication to the patient's profile.
5. EQUIPMENT COMPLIANCE: ONLY prescribe exercises using equipment listed as available. Default to bodyweight if none listed.
6. VOLUME SCALING: BEGINNER: 2 sets, 60% default reps. INTERMEDIATE: 3 sets, 100% default reps. ADVANCED: 4 sets, 120% default reps.
7. VARIETY: NEVER repeat the same exercise across different days. Rotate primary muscle groups between days.
8. CLINICAL NOTES: Write 2-3 specific coaching cues per exercise, tailored to this patient's diagnosis and limitations — not generic advice.
9. TIME MANAGEMENT: Total session time within 5 minutes of requested duration. Estimate: sets × reps × 4 sec + rest.
10. PROGRESSION LOGIC: Earlier phase post-surgery → more ACTIVATION and MOBILITY. Later phase → shift toward STRENGTHENING and BALANCE.

Respond with valid JSON only. No markdown, no explanation.`;

  const clientContext = patient
    ? `CLIENT PROFILE:
Name: ${patient.firstName} ${patient.lastName}
Primary Diagnosis: ${profileExtended?.primaryDiagnosis ?? "Not specified"}
Secondary Conditions: ${profileExtended?.secondaryDiagnoses?.length ? profileExtended.secondaryDiagnoses.join(", ") : "None"}
Current Pain Score: ${profileExtended?.painScore != null ? `${profileExtended.painScore}/10` : "Not assessed"}
Activity Level: ${profileExtended?.activityLevel ?? "Not assessed"}
Physical Limitations: ${profile?.limitations ?? "None documented"}
Comorbidities: ${profile?.comorbidities ?? "None"}
Functional Challenges: ${profile?.functionalChallenges ?? "None"}
Surgery/Injury History: ${profileExtended?.surgeryHistory ?? "None documented"}
Occupation: ${profileExtended?.occupation ?? "Not specified"}
Time Since Injury/Surgery: ${profileExtended?.injuryDate ? calculateWeeksSince(new Date(profileExtended.injuryDate)) + " weeks ago" : "Not specified"}
Prior Injuries: ${profileExtended?.priorInjuries?.length ? profileExtended.priorInjuries.join(", ") : "None"}
Available Equipment: ${profile?.availableEquipment?.length ? profile.availableEquipment.join(", ") : "Bodyweight only"}
Fitness Goals: ${profile?.fitnessGoals?.length ? profile.fitnessGoals.join(", ") : "General rehabilitation"}`
    : "No specific client assigned. Create a general program suitable for the parameters below.";

  const exerciseListStr = exercises
    .map(
      (e) =>
        `ID: ${e.id} | ${e.name} | Phase: ${e.exercisePhase ?? "STRENGTHENING"} | Region: ${e.bodyRegion} | Difficulty: ${e.difficultyLevel} | Muscles: ${e.musclesTargeted.join(", ")} | Equipment: ${e.equipmentRequired.join(", ") || "None"} | Default Rx: ${e.defaultSets ?? 3}x${e.defaultReps ? e.defaultReps : e.defaultHoldSeconds ? e.defaultHoldSeconds + "s hold" : "10"} | Mistakes: ${e.commonMistakes || "N/A"} | Cues: ${e.cuesThumbnail || "N/A"}`
    )
    .join("\n");

  const userPrompt = `Create an exercise program with the following details:

${clientContext}

Program Parameters:
- Focus Areas: ${params.focusAreas.join(", ")}
- Duration: ~${params.durationMinutes} minutes per session
- Days per Week: ${params.daysPerWeek}
- Difficulty Level: ${params.difficultyLevel}
${params.additionalNotes ? `- Additional Notes: ${params.additionalNotes}` : ""}

Available Exercises (use ONLY these exercise IDs):
${exerciseListStr}

Respond with this exact JSON structure:
{
  "title": "Program title",
  "description": "2-3 sentence clinical program description",
  "exercises": [
    {
      "exerciseId": "the exercise ID from the list above",
      "exerciseName": "exercise name",
      "phase": "ACTIVATION",
      "sets": 3,
      "reps": 15,
      "durationSeconds": null,
      "restSeconds": 30,
      "dayOfWeek": 1,
      "orderIndex": 2,
      "notes": "2-3 clinical form cues specific to this patient"
    }
  ]
}

Rules:
1. ONLY use exercise IDs from the list provided
2. Respect patient limitations and contraindications
3. Match the difficulty level requested
4. Distribute exercises across ${params.daysPerWeek} days (dayOfWeek: 1-${params.daysPerWeek})
5. Keep total session time around ${params.durationMinutes} minutes
6. Use either reps OR durationSeconds per exercise, not both (set unused to null)
7. Follow the phase ordering strictly`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
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
  orderIndex: number;
  exercises: {
    exerciseId: string;
    orderIndex: number;
    sets: number;
    reps: string;
  }[];
}

export interface GeneratedProgramWorkout {
  name: string;
  dayIndex: number;
  blocks: GeneratedProgramWorkoutBlock[];
}

export interface GeneratedProgram {
  name: string;
  description?: string;
  workouts: GeneratedProgramWorkout[];
}

export async function generateProgram(
  params: GenerateWorkoutParams
): Promise<GeneratedProgram> {
  const generatedPlan = await generateWorkoutPlan(params);

  const workoutsMap = new Map<number, GeneratedProgramWorkout>();

  generatedPlan.exercises.forEach((ex) => {
    const day = ex.dayOfWeek || 1;
    if (!workoutsMap.has(day)) {
      workoutsMap.set(day, {
        name: `Day ${day} Workout`,
        dayIndex: day,
        blocks: [],
      });
    }
    const workout = workoutsMap.get(day)!;

    let targetType = ex.phase.toUpperCase();
    if (["ACTIVATION", "STRENGTHENING", "MOBILITY"].includes(targetType)) {
      targetType = "NORMAL";
    }

    let block = workout.blocks.find((b) => b.type === targetType);
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
      orderIndex: block.exercises.length,
      sets: ex.sets || 3,
      reps: ex.reps?.toString() || "10",
    });
  });

  const workouts = Array.from(workoutsMap.values()).sort((a, b) => a.dayIndex - b.dayIndex);

  return {
    name: generatedPlan.title || "AI Generated Program",
    description: generatedPlan.description,
    workouts,
  };
}
