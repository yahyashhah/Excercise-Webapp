"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function startSessionV2Action(sessionId: string) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };
  
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser) return { success: false, error: "User not found" };

  try {
    const session = await prisma.workoutSessionV2.update({
      where: { id: sessionId, patientId: dbUser.id },
      data: { status: "IN_PROGRESS", startedAt: new Date() }
    });
    revalidatePath("/dashboard");
    revalidatePath("/sessions/" + sessionId);
    return { success: true, data: session };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to start session" };
  }
}

export async function updateSetLogV2Action(
  sessionId: string,
  blockExerciseId: string,
  setIndex: number,
  data: {
    actualReps?: number;
    actualWeight?: number;
    actualDuration?: number;
    actualRPE?: number;
    notes?: string;
  }
) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false, error: "User not found" };

    const session = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId, patientId: dbUser.id }
    });
    if (!session) return { success: false, error: "Session not found" };

    let exerciseLog = await prisma.sessionExerciseLog.findFirst({
      where: { sessionId, blockExerciseId }
    });

    if (!exerciseLog) {
      // Need to find the block exercise order index just in case, or default to 0
      const blockEx = await prisma.blockExerciseV2.findUnique({
        where: { id: blockExerciseId }
      });
      exerciseLog = await prisma.sessionExerciseLog.create({
        data: {
          sessionId,
          blockExerciseId,
          orderIndex: blockEx?.orderIndex || 0,
          status: "IN_PROGRESS"
        }
      });
    }

    let setLog = await prisma.setLog.findFirst({
      where: { sessionExerciseLogId: exerciseLog.id, setIndex }
    });

    if (setLog) {
      setLog = await prisma.setLog.update({
        where: { id: setLog.id },
        data: { ...data, completedAt: new Date() }
      });
    } else {
      setLog = await prisma.setLog.create({
        data: {
          sessionExerciseLogId: exerciseLog.id,
          setIndex,
          ...data,
          completedAt: new Date()
        }
      });
    }

    revalidatePath("/sessions/" + sessionId);
    return { success: true, data: setLog };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to update set log" };
  }
}

export async function completeSessionV2Action(
  sessionId: string,
  overallRPE?: number,
  overallNotes?: string
) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false, error: "User not found" };

    const session = await prisma.workoutSessionV2.update({
      where: { id: sessionId, patientId: dbUser.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        overallRPE,
        overallNotes
      }
    });
    
    revalidatePath("/dashboard");
    revalidatePath("/sessions/" + sessionId);
    return { success: true, data: session };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to complete session" };
  }
}
