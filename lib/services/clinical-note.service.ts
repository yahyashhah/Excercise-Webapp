import { prisma } from "@/lib/prisma";

export interface CreateClinicalNoteData {
  clientId: string;
  trainerId: string;
  sessionId?: string;
  appointmentDate: Date;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  privateNotes?: string;
}

export type UpdateClinicalNoteData = Partial<
  Omit<CreateClinicalNoteData, "clientId" | "trainerId">
>;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getNotesForClient(
  clientId: string,
  trainerId: string
) {
  return prisma.clinicalNote.findMany({
    where: { clientId, trainerId },
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
  trainerId: string,
  data: UpdateClinicalNoteData
) {
  // Ensure the trainer owns this note before allowing edits
  const existing = await prisma.clinicalNote.findUnique({ where: { id } });
  if (!existing || existing.trainerId !== trainerId) {
    throw new Error("Note not found or access denied");
  }
  return prisma.clinicalNote.update({ where: { id }, data });
}

export async function deleteNote(id: string, trainerId: string) {
  const existing = await prisma.clinicalNote.findUnique({ where: { id } });
  if (!existing || existing.trainerId !== trainerId) {
    throw new Error("Note not found or access denied");
  }
  return prisma.clinicalNote.delete({ where: { id } });
}
