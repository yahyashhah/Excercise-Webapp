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
  clientId: string,
  data: ClinicalNoteFormData
) {
  const trainer = await requireRole("TRAINER");

  if (!data.appointmentDate) {
    return { success: false as const, error: "Appointment date is required" };
  }

  try {
    const note = await noteService.createNote({
      clientId,
      trainerId: trainer.id,
      sessionId: data.sessionId,
      appointmentDate: new Date(data.appointmentDate),
      subjective: data.subjective,
      objective: data.objective,
      assessment: data.assessment,
      plan: data.plan,
      privateNotes: data.privateNotes,
    });
    revalidatePath(`/clients/${clientId}/progress`);
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
  clientId: string,
  data: ClinicalNoteFormData
) {
  const trainer = await requireRole("TRAINER");

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

    const note = await noteService.updateNote(noteId, trainer.id, updateData);
    revalidatePath(`/clients/${clientId}/progress`);
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
  clientId: string
) {
  const trainer = await requireRole("TRAINER");

  try {
    await noteService.deleteNote(noteId, trainer.id);
    revalidatePath(`/clients/${clientId}/progress`);
    return { success: true as const };
  } catch (error) {
    console.error("Failed to delete clinical note:", error);
    return { success: false as const, error: "Failed to delete clinical note" };
  }
}
