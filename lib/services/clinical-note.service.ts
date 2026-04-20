import { prisma } from "@/lib/prisma";

export interface CreateClinicalNoteData {
  patientId: string;
  clinicianId: string;
  sessionId?: string;
  appointmentDate: Date;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  privateNotes?: string;
}

export type UpdateClinicalNoteData = Partial<
  Omit<CreateClinicalNoteData, "patientId" | "clinicianId">
>;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getNotesForPatient(
  patientId: string,
  clinicianId: string
) {
  return prisma.clinicalNote.findMany({
    where: { patientId, clinicianId },
    orderBy: { appointmentDate: "desc" },
  });
}

export async function getNoteById(id: string) {
  return prisma.clinicalNote.findUnique({ where: { id } });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createNote(data: CreateClinicalNoteData) {
  return prisma.clinicalNote.create({ data });
}

export async function updateNote(
  id: string,
  clinicianId: string,
  data: UpdateClinicalNoteData
) {
  // Ensure the clinician owns this note before allowing edits
  const existing = await prisma.clinicalNote.findUnique({ where: { id } });
  if (!existing || existing.clinicianId !== clinicianId) {
    throw new Error("Note not found or access denied");
  }
  return prisma.clinicalNote.update({ where: { id }, data });
}

export async function deleteNote(id: string, clinicianId: string) {
  const existing = await prisma.clinicalNote.findUnique({ where: { id } });
  if (!existing || existing.clinicianId !== clinicianId) {
    throw new Error("Note not found or access denied");
  }
  return prisma.clinicalNote.delete({ where: { id } });
}
