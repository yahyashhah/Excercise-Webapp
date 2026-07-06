import { prisma } from "@/lib/prisma";
import { getDailySummariesForClient } from "@/lib/services/wearable.service";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/services/notification.service";

const MIN_HISTORY_DAYS = 5;

export function checkRestingHeartRateAlert(baselineAvg: number, todayValue: number): boolean {
  return todayValue > baselineAvg * 1.1;
}

export function checkHrvAlert(baselineAvg: number, todayValue: number): boolean {
  return todayValue < baselineAvg * 0.85;
}

export function checkSleepAlert(recentNightsMinutes: number[]): boolean {
  if (recentNightsMinutes.length < 3) return false;
  const lastThree = recentNightsMinutes.slice(-3);
  return lastThree.every((minutes) => minutes < 300);
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

interface AlertToRaise {
  metric: "restingHeartRate" | "hrv" | "sleep";
  title: string;
  body: string;
  value: number;
  baseline: number;
}

/**
 * Loads a client's trailing wearable data, evaluates the three alert rules,
 * and notifies every trainer in the client's clinic org for any rule that
 * fires (deduped to one open alert per metric per 24h).
 */
export async function evaluateWearableAlerts(clientId: string): Promise<void> {
  const summaries = await getDailySummariesForClient(clientId, MIN_HISTORY_DAYS + 3);
  if (summaries.length < MIN_HISTORY_DAYS + 1) return;

  const sorted = [...summaries].sort((a, b) => a.date.getTime() - b.date.getTime());
  const today = sorted[sorted.length - 1];
  const priorDays = sorted.slice(0, -1);

  const alerts: AlertToRaise[] = [];

  const priorHr = priorDays.map((d) => d.restingHeartRate).filter((v): v is number => v != null);
  if (today.restingHeartRate != null && priorHr.length >= MIN_HISTORY_DAYS) {
    const baseline = average(priorHr);
    if (checkRestingHeartRateAlert(baseline, today.restingHeartRate)) {
      alerts.push({
        metric: "restingHeartRate",
        title: "Resting heart rate elevated",
        body: `Resting HR of ${today.restingHeartRate} bpm is over 10% above the 7-day baseline of ${Math.round(baseline)} bpm.`,
        value: today.restingHeartRate,
        baseline,
      });
    }
  }

  const priorHrv = priorDays.map((d) => d.hrvMs).filter((v): v is number => v != null);
  if (today.hrvMs != null && priorHrv.length >= MIN_HISTORY_DAYS) {
    const baseline = average(priorHrv);
    if (checkHrvAlert(baseline, today.hrvMs)) {
      alerts.push({
        metric: "hrv",
        title: "HRV dropped",
        body: `HRV of ${today.hrvMs}ms is over 15% below the 7-day baseline of ${Math.round(baseline)}ms.`,
        value: today.hrvMs,
        baseline,
      });
    }
  }

  const recentSleep = sorted
    .map((d) => d.sleepDurationMin)
    .filter((v): v is number => v != null);
  if (checkSleepAlert(recentSleep)) {
    alerts.push({
      metric: "sleep",
      title: "Poor sleep trend",
      body: "Sleep duration has been under 5 hours for 3 consecutive nights.",
      value: recentSleep[recentSleep.length - 1],
      baseline: 300,
    });
  }

  if (alerts.length === 0) return;

  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: { clerkOrgId: true },
  });
  if (!client?.clerkOrgId) return;

  const trainers = await prisma.user.findMany({
    where: { clerkOrgId: client.clerkOrgId, role: "TRAINER" },
    select: { id: true },
  });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Fetch recent wearable alerts once and dedupe in application code —
  // MongoDB's support for Prisma's JSON `path` filter isn't something to
  // assume without live verification, so this avoids relying on it.
  const recentAlerts = await prisma.notification.findMany({
    where: { type: NOTIFICATION_TYPES.WEARABLE_ALERT, createdAt: { gte: since } },
    select: { metadata: true },
  });

  for (const alert of alerts) {
    const alreadyAlerted = recentAlerts.some((n) => {
      const meta = n.metadata as { clientId?: string; metric?: string } | null;
      return meta?.clientId === clientId && meta?.metric === alert.metric;
    });
    if (alreadyAlerted) continue;

    for (const trainer of trainers) {
      await createNotification({
        userId: trainer.id,
        type: NOTIFICATION_TYPES.WEARABLE_ALERT,
        title: alert.title,
        body: alert.body,
        link: `/clients/${clientId}/progress`,
        metadata: { clientId, metric: alert.metric, value: alert.value, baseline: alert.baseline },
      });
    }
  }
}
