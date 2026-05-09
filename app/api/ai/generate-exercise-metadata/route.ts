import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const metadataFields = {
  description: z.string().describe("2-3 sentence clinical description of the exercise and its purpose in a rehabilitation or senior fitness context"),
  instructions: z.string().describe("Clear step-by-step instructions for the patient, numbered list format, safety-first"),
  bodyRegion: z.enum(["LOWER_BODY", "UPPER_BODY", "CORE", "FULL_BODY", "BALANCE", "FLEXIBILITY"]).describe("Primary body region targeted"),
  difficultyLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).describe("Appropriate difficulty level for a senior/rehab population — default to BEGINNER unless clearly advanced"),
  exercisePhase: z.enum(["WARMUP", "ACTIVATION", "STRENGTHENING", "MOBILITY", "COOLDOWN"]).describe("Workout phase this exercise best fits"),
  musclesTargeted: z.array(z.string()).describe("Primary muscles worked, e.g. ['Quadriceps', 'Glutes']"),
  equipmentRequired: z.array(z.enum(["None", "Resistance Band", "Dumbbells", "Yoga Mat", "Stability Ball", "Foam Roller", "Chair", "Wall", "Towel", "Step/Stair"])).describe("Equipment needed from the standard list"),
  contraindications: z.array(z.string()).describe("Medical conditions where this exercise should be avoided, e.g. ['Acute knee injury', 'Total knee replacement < 6 weeks']"),
  commonMistakes: z.string().describe("2-3 common form errors patients make and concise corrections"),
  defaultSets: z.number().int().min(1).max(10).describe("Recommended sets"),
  defaultReps: z.number().int().min(1).max(60).describe("Recommended reps per set"),
};

// Schema for name-only flow (existing single-exercise and named upload)
const nameSchema = z.object(metadataFields);

// Schema for YouTube flow — also produces a clean professional exercise name
const youtubeSchema = z.object({
  exerciseName: z.string().describe("Clean, professional exercise name derived from the video title. Remove channel names, 'tutorial', 'how to', video numbers. E.g. 'Standing Hip Abduction with Resistance Band'"),
  ...metadataFields,
});

const SYSTEM_PROMPT = `You are an expert physical therapist specializing in senior rehabilitation and geriatric fitness.
Patients are typically older adults (60+) recovering from injury or surgery, or managing chronic conditions.
All metadata must be conservative, evidence-based, and safe for this population.`;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser || dbUser.role !== "CLINICIAN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    // ── YouTube URL flow ─────────────────────────────────────────────────────
    if (body.youtubeUrl) {
      const { youtubeUrl } = body;

      // Fetch video title + thumbnail via YouTube oEmbed (no API key required)
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`;
      const oembedRes = await fetch(oembedUrl);
      if (!oembedRes.ok) {
        return NextResponse.json({ error: "Could not fetch YouTube video info. Check the URL and try again." }, { status: 400 });
      }
      const oembed = await oembedRes.json();
      const videoTitle: string = oembed.title ?? "";
      const thumbnailUrl: string = oembed.thumbnail_url ?? "";

      const { object } = await generateObject({
        model: openai("gpt-4o"),
        schema: youtubeSchema,
        system: SYSTEM_PROMPT,
        prompt: `Generate comprehensive exercise metadata for a physical therapy video.

YouTube video title: "${videoTitle}"

Based on this title, create a clean exercise name and full clinical metadata appropriate for senior rehabilitation patients.`,
      });

      return NextResponse.json({
        success: true,
        data: {
          ...object,
          videoUrl: youtubeUrl,
          imageUrl: thumbnailUrl,
          videoProvider: "youtube",
        },
      });
    }

    // ── Name-only flow ───────────────────────────────────────────────────────
    const { name } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: "Exercise name or YouTube URL is required" }, { status: 400 });
    }

    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: nameSchema,
      system: SYSTEM_PROMPT,
      prompt: `Generate comprehensive, clinically accurate metadata for this exercise:

Exercise name: "${name}"

Provide practical, evidence-based metadata a physical therapist would give their senior patients.`,
    });

    return NextResponse.json({ success: true, data: object });
  } catch (error) {
    console.error("Failed to generate exercise metadata:", error);
    return NextResponse.json({ error: "Failed to generate metadata" }, { status: 500 });
  }
}
