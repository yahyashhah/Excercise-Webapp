"use server";

import React from "react";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NOTIFICATION_TYPES } from "@/lib/services/notification.service";
import { getResend } from "@/lib/email/resend";
import { MissedSessionEmail } from "@/lib/email/templates/missed-session";
import type { Prisma } from "@prisma/client";

const MISSED_SESSION_THRESHOLD = 2;
const LOOKBACK_DAYS = 14;
const DEDUP_HOURS = 24;

/**
 * Checks compliance for all patients linked to the current clinician.
 * Creates a MISSED_SESSION notification if a patient has 2+ sessions with
 * status not COMPLETED in the last 14 days, and no alert was already sent
 * in the last 24 hours for that patient.
 *
 * Designed to be called when a clinician loads the dashboard so no external
 * cron infrastructure is required.
 */
export async function checkComplianceAndNotify(): Promise<{ alerted: number }> {
  try {
    const { userId } = await auth();
    if (!userId) return { alerted: 0 };
    const clinician = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, role: true, email: true, firstName: true, lastName: true },
    });
    if (!clinician || clinician.role !== "CLINICIAN") return { alerted: 0 };

    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - LOOKBACK_DAYS);

    const dedupCutoff = new Date();
    dedupCutoff.setHours(dedupCutoff.getHours() - DEDUP_HOURS);

    // Fetch all active patient links for this clinician
    const patientLinks = await prisma.patientClinicianLink.findMany({
      where: { clinicianId: clinician.id, status: "active" },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    let alerted = 0;

    for (const link of patientLinks) {
      const { patient } = link;
      const patientName = `${patient.firstName} ${patient.lastName}`;

      // Count sessions in the lookback window that were not completed.
      const missedCount = await prisma.workoutSessionV2.count({
        where: {
          patientId: patient.id,
          scheduledDate: { gte: lookbackStart, lte: new Date() },
          status: { notIn: ["COMPLETED"] },
        },
      });

      if (missedCount < MISSED_SESSION_THRESHOLD) continue;

      // De-duplicate: skip if we already alerted this clinician about this
      // patient within the last 24 hours. We store patientId in metadata.
      // MongoDB does not support filtering by nested JSON key via Prisma, so
      // we fetch recent MISSED_SESSION alerts and check in-process.
      const recentAlerts = await prisma.notification.findMany({
        where: {
          userId: clinician.id,
          type: NOTIFICATION_TYPES.MISSED_SESSION,
          createdAt: { gte: dedupCutoff },
        },
        select: { metadata: true },
      });

      const alreadyAlerted = recentAlerts.some((alert) => {
        const meta = alert.metadata as Prisma.JsonObject | null;
        return meta?.patientId === patient.id;
      });

      if (alreadyAlerted) continue;

      // Create the in-app alert — metadata includes patientId for future deduplication
      await prisma.notification.create({
        data: {
          userId: clinician.id,
          type: NOTIFICATION_TYPES.MISSED_SESSION,
          title: "Missed Sessions Alert",
          body: `${patientName} has missed ${missedCount} session${missedCount !== 1 ? "s" : ""} in the last 14 days.`,
          link: "/patients",
          metadata: {
            patientId: patient.id,
            patientName,
            missedCount,
          } satisfies Prisma.InputJsonObject,
        },
      });

      // Send email to clinician — non-blocking
      try {
        const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inmotusrx.vercel.app";
        await getResend().emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "noreply@inmotusrx.com",
          to: clinician.email,
          subject: `Missed sessions: ${patientName}`,
          react: React.createElement(MissedSessionEmail, {
            clinicianName: `${clinician.firstName} ${clinician.lastName}`,
            patientName,
            missedCount,
            lookbackDays: LOOKBACK_DAYS,
            patientLink: `${appBaseUrl}/patients`,
          }),
        });
      } catch (emailErr) {
        console.error("Failed to send missed-session email (non-fatal):", emailErr);
      }

      alerted++;
    }

    return { alerted };
  } catch (error) {
    console.error("Compliance check failed:", error);
    return { alerted: 0 };
  }
}
