"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClipboardList, Edit2, Plus, Trash2 } from "lucide-react";
import { ClinicalNoteForm } from "@/components/progress/clinical-note-form";
import { deleteClinicalNoteAction } from "@/actions/clinical-note-actions";

interface ClinicalNote {
  id: string;
  appointmentDate: Date | string;
  createdAt: Date | string;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  privateNotes?: string | null;
}

interface SoapNotesTabProps {
  notes: ClinicalNote[];
  patientId: string;
}

const SECTION_STYLES = {
  subjective: "border-l-4 border-blue-400 bg-blue-50/50 pl-4 py-3 rounded-r-md",
  objective: "border-l-4 border-emerald-400 bg-emerald-50/50 pl-4 py-3 rounded-r-md",
  assessment: "border-l-4 border-amber-400 bg-amber-50/50 pl-4 py-3 rounded-r-md",
  plan: "border-l-4 border-violet-400 bg-violet-50/50 pl-4 py-3 rounded-r-md",
  private: "border-l-4 border-slate-300 bg-muted/50 pl-4 py-3 rounded-r-md",
} as const;

function NoteCard({
  note,
  onEdit,
  onDelete,
}: {
  note: ClinicalNote;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hasSections =
    note.subjective || note.objective || note.assessment || note.plan;

  return (
    <div className="rounded-xl border-0 shadow-sm ring-1 ring-border/50 bg-card p-5 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-sm">
            Appointment:{" "}
            {format(new Date(note.appointmentDate), "MMMM d, yyyy")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Recorded {format(new Date(note.createdAt), "MMM d, yyyy 'at' h:mm a")}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onEdit}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* SOAP sections */}
      {hasSections ? (
        <div className="space-y-2">
          {note.subjective && (
            <div className={SECTION_STYLES.subjective}>
              <Badge variant="outline" className="mb-1.5 text-xs border-blue-300 text-blue-700 bg-transparent">
                S — Subjective
              </Badge>
              <p className="text-sm whitespace-pre-wrap">{note.subjective}</p>
            </div>
          )}
          {note.objective && (
            <div className={SECTION_STYLES.objective}>
              <Badge variant="outline" className="mb-1.5 text-xs border-emerald-300 text-emerald-700 bg-transparent">
                O — Objective
              </Badge>
              <p className="text-sm whitespace-pre-wrap">{note.objective}</p>
            </div>
          )}
          {note.assessment && (
            <div className={SECTION_STYLES.assessment}>
              <Badge variant="outline" className="mb-1.5 text-xs border-amber-300 text-amber-700 bg-transparent">
                A — Assessment
              </Badge>
              <p className="text-sm whitespace-pre-wrap">{note.assessment}</p>
            </div>
          )}
          {note.plan && (
            <div className={SECTION_STYLES.plan}>
              <Badge variant="outline" className="mb-1.5 text-xs border-violet-300 text-violet-700 bg-transparent">
                P — Plan
              </Badge>
              <p className="text-sm whitespace-pre-wrap">{note.plan}</p>
            </div>
          )}
          {note.privateNotes && (
            <div className={SECTION_STYLES.private}>
              <Badge variant="outline" className="mb-1.5 text-xs border-slate-300 text-slate-600 bg-transparent">
                Private Notes
              </Badge>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {note.privateNotes}
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">No content recorded.</p>
      )}
    </div>
  );
}

export function SoapNotesTab({ notes: initialNotes, patientId }: SoapNotesTabProps) {
  const [notes, setNotes] = useState<ClinicalNote[]>(initialNotes);
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingNote, setEditingNote] = useState<ClinicalNote | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDeleteConfirm() {
    if (!deletingNoteId) return;
    setIsDeleting(true);
    const result = await deleteClinicalNoteAction(deletingNoteId, patientId);
    if (result.success) {
      setNotes((prev) => prev.filter((n) => n.id !== deletingNoteId));
    }
    setDeletingNoteId(null);
    setIsDeleting(false);
  }

  return (
    <div className="space-y-5">
      {/* Top action bar */}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            setEditingNote(null);
            setShowNewForm(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New Note
        </Button>
      </div>

      {/* Inline new note form */}
      {showNewForm && !editingNote && (
        <div className="rounded-xl border-0 shadow-sm ring-1 ring-border/50 bg-card p-5">
          <h3 className="font-semibold text-sm mb-4">New SOAP Note</h3>
          <ClinicalNoteForm
            patientId={patientId}
            onSuccess={() => setShowNewForm(false)}
            onCancel={() => setShowNewForm(false)}
          />
        </div>
      )}

      {/* Edit form */}
      {editingNote && (
        <div className="rounded-xl border-0 shadow-sm ring-1 ring-border/50 bg-card p-5">
          <h3 className="font-semibold text-sm mb-4">Edit SOAP Note</h3>
          <ClinicalNoteForm
            patientId={patientId}
            existingNote={editingNote}
            onSuccess={() => setEditingNote(null)}
            onCancel={() => setEditingNote(null)}
          />
        </div>
      )}

      {/* Notes list */}
      {notes.length === 0 && !showNewForm ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <div className="rounded-full bg-muted p-4">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-base font-medium text-muted-foreground">
            No SOAP notes yet
          </p>
          <p className="text-sm text-muted-foreground/70">
            Click &quot;New Note&quot; above to document your first session note.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onEdit={() => {
                setShowNewForm(false);
                setEditingNote(note);
              }}
              onDelete={() => setDeletingNoteId(note.id)}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={Boolean(deletingNoteId)}
        onOpenChange={(open) => !open && setDeletingNoteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SOAP Note</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The clinical note will be permanently
              removed from the patient record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Note"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
