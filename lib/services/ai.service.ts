import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface GenerateWorkoutParams {
  patientId: string;
  focusAreas: string[];
  durationMinutes: number;
  daysPerWeek: number;
  difficultyLevel: string;
  additionalNotes?: string;
}

interface GeneratedExercise {
  exerciseId: string;
  exerciseName: string;
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

export async function generateWorkoutPlan(
  params: GenerateWorkoutParams
): Promise<GeneratedPlan> {
  // Fetch patient profile for context
  const patient = await prisma.user.findUnique({
    where: { id: params.patientId },
    include: { patientProfile: true },
  });

  if (!patient) throw new Error("Patient not found");

  // Fetch available exercises from the library
  const exercises = await prisma.exercise.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      bodyRegion: true,
      difficultyLevel: true,
      equipmentRequired: true,
      contraindications: true,
      description: true,
    },
  });

  const profile = patient.patientProfile;

  const systemPrompt = `You are a rehabilitation exercise specialist AI assistant. Your role is to create personalized home exercise programs based on patient profiles and available exercises.

You MUST respond with valid JSON only. No markdown, no explanation, just JSON.`;

  const userPrompt = `Create a personalized exercise program for this patient:

Patient: ${patient.firstName} ${patient.lastName}
${profile?.limitations ? `Limitations: ${profile.limitations}` : ""}
${profile?.comorbidities ? `Comorbidities: ${profile.comorbidities}` : ""}
${profile?.functionalChallenges ? `Functional Challenges: ${profile.functionalChallenges}` : ""}
${profile?.availableEquipment?.length ? `Available Equipment: ${profile.availableEquipment.join(", ")}` : "No equipment"}
${profile?.fitnessGoals?.length ? `Goals: ${profile.fitnessGoals.join(", ")}` : ""}

Program Parameters:
- Focus Areas: ${params.focusAreas.join(", ")}
- Duration: ~${params.durationMinutes} minutes per session
- Days per Week: ${params.daysPerWeek}
- Difficulty Level: ${params.difficultyLevel}
${params.additionalNotes ? `- Additional Notes: ${params.additionalNotes}` : ""}

Available Exercises (use ONLY these exercise IDs):
${exercises.map((e) => `- ID: ${e.id} | Name: ${e.name} | Region: ${e.bodyRegion} | Difficulty: ${e.difficultyLevel} | Equipment: ${e.equipmentRequired.join(", ") || "None"} | Contraindications: ${e.contraindications.join(", ") || "None"}`).join("\n")}

Respond with this exact JSON structure:
{
  "title": "Program title",
  "description": "Brief description of the program",
  "exercises": [
    {
      "exerciseId": "the exercise ID from the list above",
      "exerciseName": "exercise name",
      "sets": 3,
      "reps": 10,
      "durationSeconds": null,
      "restSeconds": 30,
      "dayOfWeek": 0,
      "orderIndex": 0,
      "notes": "optional form cues or modifications"
    }
  ]
}

Rules:
1. ONLY use exercise IDs from the list provided
2. Respect patient limitations and contraindications
3. Match the difficulty level requested
4. Distribute exercises across the requested days per week (dayOfWeek: 0-6, Mon-Sun)
5. Keep total session time around ${params.durationMinutes} minutes
6. Include appropriate rest periods
7. Use either reps OR durationSeconds per exercise, not both
8. Order exercises logically (warm-up, main, cool-down)`;

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

  // Parse the JSON response
  const parsed = JSON.parse(responseText) as GeneratedPlan;

  // Validate that all exercise IDs exist
  const exerciseIds = new Set(exercises.map((e) => e.id));
  const validExercises = parsed.exercises.filter((e) =>
    exerciseIds.has(e.exerciseId)
  );

  if (validExercises.length === 0) {
    throw new Error("AI generated no valid exercises. Please try again.");
  }

  return {
    ...parsed,
    exercises: validExercises,
  };
}
