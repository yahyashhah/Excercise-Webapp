import { prisma } from "@/lib/prisma";
import { logAudit, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";

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

const DIFFABLE_NOTE_FIELDS = ["subjective", "objective", "assessment", "plan", "privateNotes", "appointmentDate", "sessionId"] as const;

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

export async function createNote(
  data: CreateClinicalNoteData,
  actor?: { id: string; name: string; actorType: "TRAINER" | "SUPER_ADMIN"; orgId: string | null }
) {
  const note = await prisma.clinicalNote.create({ data });
  await logAudit({
    actorId: actor?.id ?? data.trainerId,
    actorType: actor?.actorType ?? "TRAINER",
    actorName: actor?.name ?? "",
    action: AUDIT_ACTIONS.CLINICAL_NOTE_CREATED,
    targetType: "ClinicalNote",
    targetId: note.id,
    orgId: actor?.orgId ?? null,
  });
  return note;
}

export async function updateNote(
  id: string,
  trainerId: string,
  data: UpdateClinicalNoteData,
  actor: { name: string; actorType: "TRAINER" | "SUPER_ADMIN"; orgId: string | null }
) {
  // Ensure the trainer owns this note before allowing edits
  const existing = await prisma.clinicalNote.findUnique({ where: { id } });
  if (!existing || existing.trainerId !== trainerId) {
    throw new Error("Note not found or access denied");
  }

  const changedFields = DIFFABLE_NOTE_FIELDS.filter(
    (key) => key in data && (data as Record<string, unknown>)[key] !== (existing as Record<string, unknown>)[key]
  );

  const updated = await prisma.clinicalNote.update({ where: { id }, data });

  await logAudit({
    actorId: trainerId,
    actorType: actor.actorType,
    actorName: actor.name,
    action: AUDIT_ACTIONS.CLINICAL_NOTE_UPDATED,
    targetType: "ClinicalNote",
    targetId: id,
    orgId: actor.orgId,
    metadata: changedFields.length ? { changedFields } : undefined,
  });

  return updated;
}

export async function deleteNote(
  id: string,
  trainerId: string,
  orgId: string | null,
  actor?: { name: string; actorType: "TRAINER" | "SUPER_ADMIN" }
) {
  const existing = await prisma.clinicalNote.findUnique({ where: { id } });
  if (!existing || existing.trainerId !== trainerId) {
    throw new Error("Note not found or access denied");
  }

  // Delete first: only log the deletion once it has actually happened, so a
  // failed delete never leaves a false "deleted" audit row for this
  // PHI-adjacent record.
  const deleted = await prisma.clinicalNote.delete({ where: { id } });

  await logAudit({
    actorId: trainerId,
    actorType: actor?.actorType ?? "TRAINER",
    actorName: actor?.name ?? "",
    action: AUDIT_ACTIONS.CLINICAL_NOTE_DELETED,
    targetType: "ClinicalNote",
    targetId: id,
    orgId,
  });

  return deleted;
}
