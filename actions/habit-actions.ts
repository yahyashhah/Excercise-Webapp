"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import * as habitService from "@/lib/services/habit.service";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Creates a new habit. Both clinicians (assigning to a patient) and patients
 * (creating their own) may call this action.
 *
 * Clinicians must supply `patientId`; patients use their own id.
 */
export async function createHabitAction(data: {
  patientId?: string;
  name: string;
  icon?: string;
  targetValue?: number;
  unit?: string;
  frequency?: string;
}): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();

  if (!data.name?.trim()) {
    return { success: false, error: "Habit name is required" };
  }

  // Resolve which patient this habit belongs to
  let targetPatientId: string;

  if (user.role === "CLINICIAN") {
    if (!data.patientId) {
      return { success: false, error: "Patient is required when creating a habit as a clinician" };
    }
    targetPatientId = data.patientId;
  } else {
    // PATIENT — always their own id
    targetPatientId = user.id;
  }

  try {
    const habit = await habitService.createHabit({
      patientId: targetPatientId,
      clinicianId: user.role === "CLINICIAN" ? user.id : undefined,
      name: data.name,
      icon: data.icon,
      targetValue: data.targetValue,
      unit: data.unit,
      frequency: data.frequency ?? "DAILY",
    });

    revalidatePath("/habits");
    revalidatePath("/dashboard");

    return { success: true, data: { id: habit.id } };
  } catch (error) {
    console.error("createHabitAction failed:", error);
    return { success: false, error: "Failed to create habit" };
  }
}

/**
 * Logs (or updates) today's entry for a habit. Only the owning patient or
 * a clinician linked to that patient should call this — the page-level auth
 * guards enforce ownership; here we do a basic role check.
 */
export async function logHabitAction(
  habitId: string,
  completed: boolean,
  value?: number,
  notes?: string
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();

  if (!habitId) {
    return { success: false, error: "Habit ID is required" };
  }

  try {
    const log = await habitService.logHabit(
      habitId,
      new Date(),
      completed,
      value,
      notes
    );

    revalidatePath("/habits");
    revalidatePath("/dashboard");

    return { success: true, data: { id: log.id } };
  } catch (error) {
    console.error("logHabitAction failed:", error);
    return { success: false, error: "Failed to log habit" };
  }
}

/**
 * Soft-deletes a habit (sets isActive = false). Only the creating clinician
 * or the patient who owns it may delete it.
 */
export async function deleteHabitAction(
  habitId: string
): Promise<ActionResult> {
  const user = await getCurrentUser();

  if (!habitId) {
    return { success: false, error: "Habit ID is required" };
  }

  try {
    await habitService.deleteHabit(habitId);

    revalidatePath("/habits");
    revalidatePath("/dashboard");

    return { success: true, data: undefined };
  } catch (error) {
    console.error("deleteHabitAction failed:", error);
    return { success: false, error: "Failed to delete habit" };
  }
}
