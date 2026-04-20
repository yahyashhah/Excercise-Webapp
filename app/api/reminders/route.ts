import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/email/resend";
import { SessionReminderEmail } from "@/lib/email/templates/session-reminder";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/services/notification.service";
import { format } from "date-fns";
import React from "react";

/**
 * GET /api/reminders
 *
 * Finds all WorkoutSessionV2 records scheduled within the next 24 hours
 * that have not yet received a reminder (identified by a SESSION_REMINDER
 * notification in the patient's notification record).
 *
 * Sends a reminder email via Resend and creates an in-app notification.
 *
 * Intended to be called by a cron job (e.g. Vercel Cron, GitHub Actions).
 * Secure this endpoint with a shared secret in production:
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  // Validate the cron secret to prevent unauthorized triggers.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find sessions scheduled in the next 24 hours that are not yet started/completed
    const upcomingSessions = await prisma.workoutSessionV2.findMany({
      where: {
        scheduledDate: { gte: now, lte: windowEnd },
        status: "SCHEDULED",
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        workout: {
          select: { name: true },
        },
      },
    });

    if (upcomingSessions.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    // Build a set of sessionIds that already have a SESSION_REMINDER notification.
    // We store the sessionId in the notification metadata to enable this check.
    const sessionIds = upcomingSessions.map((s) => s.id);

    const existingReminders = await prisma.notification.findMany({
      where: {
        type: NOTIFICATION_TYPES.SESSION_REMINDER,
        userId: { in: upcomingSessions.map((s) => s.patientId) },
      },
      select: { metadata: true },
    });

    const alreadyRemindedSessionIds = new Set<string>(
      existingReminders
        .map((n) => {
          const meta = n.metadata as Record<string, unknown> | null;
          return typeof meta?.sessionId === "string" ? meta.sessionId : null;
        })
        .filter((id): id is string => id !== null)
    );

    let sent = 0;
    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://inmotusrx.vercel.app";

    for (const session of upcomingSessions) {
      // Skip if reminder already sent for this session
      if (alreadyRemindedSessionIds.has(session.id)) continue;

      const { patient, workout } = session;
      const patientName = `${patient.firstName} ${patient.lastName}`;
      const sessionDate = format(new Date(session.scheduledDate), "EEEE, MMMM d, yyyy");
      const sessionTime = format(new Date(session.scheduledDate), "h:mm a");
      const sessionLink = `${appBaseUrl}/sessions`;

      // Send email via Resend
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "noreply@inmotusrx.com",
          to: patient.email,
          subject: `Reminder: Your session "${workout.name}" is tomorrow`,
          react: React.createElement(SessionReminderEmail, {
            patientName,
            sessionDate,
            sessionTime,
            workoutName: workout.name,
            sessionLink,
          }),
        });
      } catch (emailError) {
        // Log but don't fail the whole batch for one email error
        console.error(
          `Failed to send reminder email to ${patient.email}:`,
          emailError
        );
        continue;
      }

      // Create in-app notification with sessionId in metadata for deduplication
      await createNotification({
        userId: patient.id,
        type: NOTIFICATION_TYPES.SESSION_REMINDER,
        title: "Session Reminder",
        body: `Your workout "${workout.name}" is scheduled for ${sessionDate} at ${sessionTime}.`,
        link: sessionLink,
        metadata: {
          sessionId: session.id,
          sessionDate,
          sessionTime,
          workoutName: workout.name,
        },
      });

      sent++;
    }

    return NextResponse.json({ sent });
  } catch (error) {
    console.error("Reminder cron job failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
