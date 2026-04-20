"use server";

import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { createComplianceAlert, NOTIFICATION_TYPES } from "@/lib/services/notification.service";
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
    const clinician = await getCurrentUser();
    if (clinician.role !== "CLINICIAN") return { alerted: 0 };

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

      // Create the alert — metadata includes patientId for future deduplication
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

      alerted++;
    }

    return { alerted };
  } catch (error) {
    console.error("Compliance check failed:", error);
    return { alerted: 0 };
  }
}
