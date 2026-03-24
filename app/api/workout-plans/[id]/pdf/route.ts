import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFile } from "fs/promises";
import { join } from "path";
import { HEPDocument } from "@/lib/pdf/hep-document";
import {
  isYouTubeUrl,
  extractYouTubeId,
  getYouTubeThumbnail,
} from "@/lib/utils/video";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Fetch plan with all required data
  const plan = await prisma.workoutPlan.findUnique({
    where: { id },
    include: {
      exercises: {
        where: { isActive: true },
        include: {
          exercise: {
            include: { media: true },
          },
        },
        orderBy: { orderIndex: "asc" },
      },
      patient: true,
      createdBy: true,
    },
  });

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  // Verify access
  if (
    dbUser.role === "PATIENT" &&
    plan.patientId !== dbUser.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (
    dbUser.role === "CLINICIAN" &&
    plan.createdById !== dbUser.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch clinic profile
  const clinicProfile = await prisma.clinicProfile.findUnique({
    where: { clinicianId: plan.createdById },
  });

  // Load placeholder image
  let placeholderBuffer: Buffer;
  try {
    placeholderBuffer = await readFile(
      join(process.cwd(), "public", "images", "exercise-placeholder.png")
    );
  } catch {
    // Fallback: create a minimal 1x1 gray pixel PNG
    placeholderBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88P/BfwAJhAPjCkFJ8QAAAABJRU5ErkJggg==",
      "base64"
    );
  }

  // Fetch clinic logo
  let clinicLogoBuffer: Buffer | null = null;
  if (clinicProfile?.logoUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const logoRes = await fetch(clinicProfile.logoUrl, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (logoRes.ok) {
        clinicLogoBuffer = Buffer.from(await logoRes.arrayBuffer());
      }
    } catch {
      // Proceed without logo
    }
  }

  // Fetch exercise images in parallel
  const imageMap = new Map<string, Buffer>();
  const imagePromises = plan.exercises.map(async (pe) => {
    const exercise = pe.exercise;
    let imageUrl: string | null = null;

    // Priority: media[0].url > imageUrl > YouTube thumbnail
    if (exercise.media?.[0]?.url) {
      imageUrl = exercise.media[0].url;
    } else if (exercise.imageUrl) {
      imageUrl = exercise.imageUrl;
    } else if (exercise.videoUrl && isYouTubeUrl(exercise.videoUrl)) {
      const ytId = extractYouTubeId(exercise.videoUrl);
      if (ytId) {
        imageUrl = getYouTubeThumbnail(ytId);
      }
    }

    if (imageUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(imageUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          imageMap.set(exercise.id, buffer);
        }
      } catch {
        // Fallback to placeholder -- imageMap will not have this exercise
      }
    }
  });

  await Promise.allSettled(imagePromises);

  // Group exercises by day
  const exercisesByDay = new Map<
    number,
    Array<{
      exerciseId: string;
      name: string;
      sets: number;
      reps: number | null;
      durationSeconds: number | null;
      restSeconds: number | null;
      notes: string | null;
      cuesThumbnail: string | null;
      dayOfWeek: number;
    }>
  >();

  for (const pe of plan.exercises) {
    const day = pe.dayOfWeek ?? 1;
    if (!exercisesByDay.has(day)) exercisesByDay.set(day, []);
    exercisesByDay.get(day)!.push({
      exerciseId: pe.exercise.id,
      name: pe.exercise.name,
      sets: pe.sets,
      reps: pe.reps,
      durationSeconds: pe.durationSeconds,
      restSeconds: pe.restSeconds,
      notes: pe.notes,
      cuesThumbnail: pe.exercise.cuesThumbnail ?? null,
      dayOfWeek: day,
    });
  }

  const clientName = plan.patient
    ? `${plan.patient.firstName} ${plan.patient.lastName}`
    : undefined;

  const createdDate = plan.createdAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Render PDF
  const pdfElement = React.createElement(HEPDocument, {
    planTitle: plan.title,
    planDescription: plan.description,
    clientName,
    createdDate,
    daysPerWeek: plan.daysPerWeek,
    durationMinutes: plan.durationMinutes,
    clinicName: clinicProfile?.clinicName,
    clinicTagline: clinicProfile?.tagline ?? undefined,
    clinicLogoBuffer,
    exercisesByDay,
    imageMap,
    placeholderBuffer,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(pdfElement as any);

  const sanitizedTitle = plan.title
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sanitizedTitle}-hep.pdf"`,
    },
  });
}
