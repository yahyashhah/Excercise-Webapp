"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/current-user";
import * as noteService from "@/lib/services/clinical-note.service";
import type { UpdateClinicalNoteData } from "@/lib/services/clinical-note.service";

export interface ClinicalNoteFormData {
  appointmentDate: string; // ISO date string from form input
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  privateNotes?: string;
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createClinicalNoteAction(
  patientId: string,
  data: ClinicalNoteFormData
) {
  const clinician = await requireRole("CLINICIAN");

  if (!data.appointmentDate) {
    return { success: false as const, error: "Appointment date is required" };
  }

  try {
    const note = await noteService.createNote({
      patientId,
      clinicianId: clinician.id,
      sessionId: data.sessionId,
      appointmentDate: new Date(data.appointmentDate),
      subjective: data.subjective,
      objective: data.objective,
      assessment: data.assessment,
      plan: data.plan,
      privateNotes: data.privateNotes,
    });
    revalidatePath(`/patients/${patientId}/progress`);
    return { success: true as const, data: note };
  } catch (error) {
    console.error("Failed to create clinical note:", error);
    return { success: false as const, error: "Failed to create clinical note" };
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateClinicalNoteAction(
  noteId: string,
  patientId: string,
  data: ClinicalNoteFormData
) {
  const clinician = await requireRole("CLINICIAN");

  try {
    const updateData: UpdateClinicalNoteData = {
      ...(data.appointmentDate
        ? { appointmentDate: new Date(data.appointmentDate) }
        : {}),
      subjective: data.subjective,
      objective: data.objective,
      assessment: data.assessment,
      plan: data.plan,
      privateNotes: data.privateNotes,
      sessionId: data.sessionId,
    };

    const note = await noteService.updateNote(noteId, clinician.id, updateData);
    revalidatePath(`/patients/${patientId}/progress`);
    return { success: true as const, data: note };
  } catch (error) {
    console.error("Failed to update clinical note:", error);
    return { success: false as const, error: "Failed to update clinical note" };
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteClinicalNoteAction(
  noteId: string,
  patientId: string
) {
  const clinician = await requireRole("CLINICIAN");

  try {
    await noteService.deleteNote(noteId, clinician.id);
    revalidatePath(`/patients/${patientId}/progress`);
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete clinical note:", error);
    return { success: false as const, error: "Failed to delete clinical note" };
  }
}
