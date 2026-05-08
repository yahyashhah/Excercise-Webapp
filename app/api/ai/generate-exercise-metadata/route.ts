import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const exerciseMetadataSchema = z.object({
  description: z.string().describe("2-3 sentence clinical description of the exercise and its purpose"),
  instructions: z.string().describe("Step-by-step instructions for the patient to perform the exercise safely, numbered list format"),
  bodyRegion: z.enum(["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"]).describe("Primary body region targeted"),
  difficultyLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).describe("Appropriate difficulty level for a senior/rehab population"),
  exercisePhase: z.enum(["WARMUP", "ACTIVATION", "STRENGTHENING", "MOBILITY", "COOLDOWN"]).describe("The phase of a workout session this exercise belongs to"),
  musclesTargeted: z.array(z.string()).describe("List of primary muscles worked, e.g. ['Quadriceps', 'Glutes']"),
  equipmentRequired: z.array(z.enum(["None", "Resistance Band", "Dumbbells", "Yoga Mat", "Stability Ball", "Foam Roller", "Chair", "Wall", "Towel", "Step/Stair"])).describe("Equipment needed from the standard list"),
  contraindications: z.array(z.string()).describe("Medical conditions or situations where this exercise should be avoided, e.g. ['Acute knee injury', 'Total knee replacement < 6 weeks']"),
  commonMistakes: z.string().describe("2-3 common form errors patients make and how to correct them"),
  defaultSets: z.number().int().min(1).max(10).describe("Recommended number of sets"),
  defaultReps: z.number().int().min(1).max(60).describe("Recommended number of repetitions per set"),
});

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser || dbUser.role !== "CLINICIAN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { name } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "Exercise name is required" }, { status: 400 });
    }

    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: exerciseMetadataSchema,
      prompt: `You are an expert physical therapist specializing in senior rehabilitation.
Generate comprehensive, clinically accurate metadata for the following exercise:

Exercise name: "${name}"

Context: This exercise is for a senior health and rehabilitation platform. Patients are typically older adults (60+) recovering from injury, surgery, or managing chronic conditions. All recommendations should be conservative, safe, and appropriate for this population.

Generate practical, evidence-based metadata that a physical therapist would provide to their patients.`,
    });

    return NextResponse.json({ success: true, data: object });
  } catch (error) {
    console.error("Failed to generate exercise metadata:", error);
    return NextResponse.json({ error: "Failed to generate metadata" }, { status: 500 });
  }
}
