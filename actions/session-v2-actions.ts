"use server";

import React from "react";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/services/notification.service";
import { getResend } from "@/lib/email/resend";
import { SessionCompletedEmail } from "@/lib/email/templates/session-completed";

async function notifyClinicianOnCompletion(
  sessionId: string,
  patient: { id: string; firstName: string; lastName: string }
) {
  const session = await prisma.workoutSessionV2.findUnique({
    where: { id: sessionId },
    include: {
      workout: {
        include: {
          program: {
            include: {
              clinician: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
        },
      },
    },
  });

  if (!session?.workout.program.clinician) return;

  const { clinician } = session.workout.program;
  const patientName = `${patient.firstName} ${patient.lastName}`;
  const workoutName = session.workout.name;
  const programName = session.workout.program.name;
  const programId = session.workout.program.id;
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inmotusrx.vercel.app";
  const patientLink = `${appBaseUrl}/programs/${programId}`;

  await createNotification({
    userId: clinician.id,
    type: NOTIFICATION_TYPES.SESSION_COMPLETED,
    title: "Session Completed",
    body: `${patientName} completed "${workoutName}".`,
    link: patientLink,
    metadata: { patientId: patient.id, patientName, workoutName, programId },
  });

  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@inmotusrx.com",
    to: clinician.email,
    subject: `${patientName} completed a session`,
    react: React.createElement(SessionCompletedEmail, {
      clinicianName: `${clinician.firstName} ${clinician.lastName}`,
      patientName,
      workoutName,
      programName,
      patientLink,
    }),
  });
}

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

    if (session.status === "SCHEDULED") {
      await prisma.workoutSessionV2.update({
        where: { id: sessionId },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
    }

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

export async function updateExerciseActualSetsAction(
  sessionId: string,
  blockExerciseId: string,
  actualSets: number | null
) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false, error: "User not found" };

    const exerciseLog = await prisma.sessionExerciseLog.findFirst({
      where: { sessionId, blockExerciseId },
    });

    if (exerciseLog) {
      await prisma.sessionExerciseLog.update({
        where: { id: exerciseLog.id },
        data: { actualSets },
      });
    } else {
      const blockEx = await prisma.blockExerciseV2.findUnique({ where: { id: blockExerciseId } });
      await prisma.sessionExerciseLog.create({
        data: { sessionId, blockExerciseId, orderIndex: blockEx?.orderIndex ?? 0, status: "IN_PROGRESS", actualSets },
      });
    }

    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to update actual sets" };
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

    await prisma.workoutSessionV2.update({
      where: { id: sessionId, patientId: dbUser.id },
      data: { status: "COMPLETED", completedAt: new Date(), overallRPE, overallNotes },
    });

    // Fire clinician notification — non-blocking, failures must not break completion
    try {
      await notifyClinicianOnCompletion(sessionId, {
        id: dbUser.id,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
      });
    } catch (notifyErr) {
      console.error("Completion notification failed (non-fatal):", notifyErr);
    }

    revalidatePath("/dashboard");
    revalidatePath("/sessions/" + sessionId);
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to complete session" };
  }
}

export async function markExerciseDoneAction(
  sessionId: string,
  blockExerciseId: string,
  setCount: number,
  done: boolean
) {
  const { userId } = await auth();
  if (!userId) return { success: false as const, error: "Unauthorized" };

  try {
    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false as const, error: "User not found" };

    const session = await prisma.workoutSessionV2.findUnique({
      where: { id: sessionId, patientId: dbUser.id },
      select: { status: true },
    });
    if (!session) return { success: false as const, error: "Session not found" };

    if (session.status === "SCHEDULED") {
      await prisma.workoutSessionV2.update({
        where: { id: sessionId },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
    }

    if (done) {
      const blockEx = await prisma.blockExerciseV2.findUnique({ where: { id: blockExerciseId } });
      let exerciseLog = await prisma.sessionExerciseLog.findFirst({
        where: { sessionId, blockExerciseId },
      });
      if (!exerciseLog) {
        exerciseLog = await prisma.sessionExerciseLog.create({
          data: { sessionId, blockExerciseId, orderIndex: blockEx?.orderIndex ?? 0, status: "COMPLETED", completedAt: new Date() },
        });
      } else {
        await prisma.sessionExerciseLog.update({
          where: { id: exerciseLog.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
      }
      for (let i = 0; i < Math.max(1, setCount); i++) {
        const existing = await prisma.setLog.findFirst({
          where: { sessionExerciseLogId: exerciseLog.id, setIndex: i },
        });
        if (!existing) {
          await prisma.setLog.create({
            data: { sessionExerciseLogId: exerciseLog.id, setIndex: i, completedAt: new Date() },
          });
        }
      }
    } else {
      const exerciseLog = await prisma.sessionExerciseLog.findFirst({
        where: { sessionId, blockExerciseId },
      });
      if (exerciseLog) {
        await prisma.sessionExerciseLog.update({
          where: { id: exerciseLog.id },
          data: { status: "PENDING", completedAt: null },
        });
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/sessions/" + sessionId);
    return { success: true as const };
  } catch (error) {
    console.error(error);
    return { success: false as const, error: "Failed to update exercise" };
  }
}
