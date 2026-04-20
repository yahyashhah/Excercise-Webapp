"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import * as progressService from "@/lib/services/progress.service";

// ---------------------------------------------------------------------------
// Progress Photo Actions (patient only)
// ---------------------------------------------------------------------------

export async function addProgressPhotoAction(
  imageUrl: string,
  angle?: string,
  notes?: string
) {
  const user = await getCurrentUser();
  if (user.role !== "PATIENT") {
    return { success: false as const, error: "Only patients can add progress photos" };
  }

  try {
    const photo = await progressService.addProgressPhoto(
      user.id,
      imageUrl,
      angle,
      notes
    );
    revalidatePath(`/patients/${user.id}/progress`);
    return { success: true as const, data: photo };
  } catch (error) {
    console.error("Failed to add progress photo:", error);
    return { success: false as const, error: "Failed to add progress photo" };
  }
}

export async function deleteProgressPhotoAction(photoId: string) {
  const user = await getCurrentUser();
  if (user.role !== "PATIENT") {
    return { success: false as const, error: "Only patients can delete their photos" };
  }

  try {
    await progressService.deleteProgressPhoto(photoId, user.id);
    revalidatePath(`/patients/${user.id}/progress`);
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete progress photo:", error);
    return { success: false as const, error: "Failed to delete progress photo" };
  }
}

// ---------------------------------------------------------------------------
// Body Metric Actions (patient or clinician)
// ---------------------------------------------------------------------------

export async function addBodyMetricAction(
  patientId: string,
  metricType: string,
  value: number,
  unit: string,
  notes?: string
) {
  const user = await getCurrentUser();

  // Patients can only add metrics for themselves; clinicians for any patient
  if (user.role === "PATIENT" && user.id !== patientId) {
    return { success: false as const, error: "Forbidden" };
  }

  try {
    const metric = await progressService.addBodyMetric(
      patientId,
      metricType,
      value,
      unit,
      notes
    );
    revalidatePath(`/patients/${patientId}/progress`);
    return { success: true as const, data: metric };
  } catch (error) {
    console.error("Failed to add body metric:", error);
    return { success: false as const, error: "Failed to add body metric" };
  }
}
