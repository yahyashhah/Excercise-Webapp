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
 * Checks compliance for all clients linked to the current trainer.
 * Creates a MISSED_SESSION notification if a client has 2+ sessions with
 * status not COMPLETED in the last 14 days, and no alert was already sent
 * in the last 24 hours for that client.
 *
 * Designed to be called when a trainer loads the dashboard so no external
 * cron infrastructure is required.
 */
export async function checkComplianceAndNotify(): Promise<{ alerted: number }> {
  try {
    const { userId } = await auth();
    if (!userId) return { alerted: 0 };
    const trainer = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, role: true, email: true, firstName: true, lastName: true, clerkOrgId: true },
    });
    if (!trainer || trainer.role !== "TRAINER") return { alerted: 0 };
    if (!trainer.clerkOrgId) return { alerted: 0 };

    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - LOOKBACK_DAYS);

    const dedupCutoff = new Date();
    dedupCutoff.setHours(dedupCutoff.getHours() - DEDUP_HOURS);

    // Fetch all clients in this trainer's organization
    const clients = await prisma.user.findMany({
      where: { clerkOrgId: trainer.clerkOrgId, role: "CLIENT" },
      select: { id: true, firstName: true, lastName: true },
    });

    let alerted = 0;

    for (const client of clients) {
      const clientName = `${client.firstName} ${client.lastName}`;

      // Count sessions in the lookback window that were not completed.
      const missedCount = await prisma.workoutSessionV2.count({
        where: {
          clientId: client.id,
          scheduledDate: { gte: lookbackStart, lte: new Date() },
          status: { notIn: ["COMPLETED"] },
        },
      });

      if (missedCount < MISSED_SESSION_THRESHOLD) continue;

      // De-duplicate: skip if we already alerted this trainer about this
      // client within the last 24 hours. We store clientId in metadata.
      // MongoDB does not support filtering by nested JSON key via Prisma, so
      // we fetch recent MISSED_SESSION alerts and check in-process.
      const recentAlerts = await prisma.notification.findMany({
        where: {
          userId: trainer.id,
          type: NOTIFICATION_TYPES.MISSED_SESSION,
          createdAt: { gte: dedupCutoff },
        },
        select: { metadata: true },
      });

      const alreadyAlerted = recentAlerts.some((alert) => {
        const meta = alert.metadata as Prisma.JsonObject | null;
        return meta?.clientId === client.id;
      });

      if (alreadyAlerted) continue;

      // Create the in-app alert — metadata includes clientId for future deduplication
      await prisma.notification.create({
        data: {
          userId: trainer.id,
          type: NOTIFICATION_TYPES.MISSED_SESSION,
          title: "Missed Sessions Alert",
          body: `${clientName} has missed ${missedCount} session${missedCount !== 1 ? "s" : ""} in the last 14 days.`,
          link: "/clients",
          metadata: {
            clientId: client.id,
            clientName,
            missedCount,
          } satisfies Prisma.InputJsonObject,
        },
      });

      // Send email to trainer — non-blocking
      try {
        const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inmotusrx.vercel.app";
        await getResend().emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "noreply@inmotusrx.com",
          to: trainer.email,
          subject: `Missed sessions: ${clientName}`,
          react: React.createElement(MissedSessionEmail, {
            trainerName: `${trainer.firstName} ${trainer.lastName}`,
            clientName,
            missedCount,
            lookbackDays: LOOKBACK_DAYS,
            clientLink: `${appBaseUrl}/clients`,
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
