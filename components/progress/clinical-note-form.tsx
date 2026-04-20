"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createClinicalNoteAction,
  updateClinicalNoteAction,
  type ClinicalNoteFormData,
} from "@/actions/clinical-note-actions";

interface ClinicalNote {
  id: string;
  appointmentDate: Date | string;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  privateNotes?: string | null;
}

interface ClinicalNoteFormProps {
  patientId: string;
  /** Pass an existing note to enable edit mode. */
  existingNote?: ClinicalNote;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const SECTION_STYLES = {
  subjective:
    "border-l-4 border-blue-400 bg-blue-50/50 pl-4 py-3 rounded-r-md",
  objective:
    "border-l-4 border-emerald-400 bg-emerald-50/50 pl-4 py-3 rounded-r-md",
  assessment:
    "border-l-4 border-amber-400 bg-amber-50/50 pl-4 py-3 rounded-r-md",
  plan: "border-l-4 border-violet-400 bg-violet-50/50 pl-4 py-3 rounded-r-md",
  private:
    "border-l-4 border-slate-300 bg-muted/50 pl-4 py-3 rounded-r-md",
} as const;

export function ClinicalNoteForm({
  patientId,
  existingNote,
  onSuccess,
  onCancel,
}: ClinicalNoteFormProps) {
  const isEditing = Boolean(existingNote);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [appointmentDate, setAppointmentDate] = useState(
    existingNote
      ? format(new Date(existingNote.appointmentDate), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd")
  );
  const [subjective, setSubjective] = useState(existingNote?.subjective ?? "");
  const [objective, setObjective] = useState(existingNote?.objective ?? "");
  const [assessment, setAssessment] = useState(existingNote?.assessment ?? "");
  const [plan, setPlan] = useState(existingNote?.plan ?? "");
  const [privateNotes, setPrivateNotes] = useState(
    existingNote?.privateNotes ?? ""
  );

  function buildFormData(): ClinicalNoteFormData {
    return {
      appointmentDate,
      subjective: subjective.trim() || undefined,
      objective: objective.trim() || undefined,
      assessment: assessment.trim() || undefined,
      plan: plan.trim() || undefined,
      privateNotes: privateNotes.trim() || undefined,
    };
  }

  function handleSubmit() {
    setError(null);

    if (!appointmentDate) {
      setError("Appointment date is required.");
      return;
    }

    startTransition(async () => {
      const formData = buildFormData();
      const result = isEditing && existingNote
        ? await updateClinicalNoteAction(existingNote.id, patientId, formData)
        : await createClinicalNoteAction(patientId, formData);

      if (result.success) {
        onSuccess?.();
      } else {
        setError(result.error ?? "Failed to save note.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Appointment Date */}
      <div className="space-y-1.5">
        <Label htmlFor="note-date">Appointment Date</Label>
        <Input
          id="note-date"
          type="date"
          value={appointmentDate}
          onChange={(e) => setAppointmentDate(e.target.value)}
          className="w-48"
        />
      </div>

      {/* Subjective */}
      <div className={SECTION_STYLES.subjective}>
        <Label className="text-blue-700 font-semibold text-sm mb-1.5 block">
          Subjective (S)
        </Label>
        <p className="text-xs text-blue-600/70 mb-2">
          What the patient reports — symptoms, pain levels, functional complaints
        </p>
        <Textarea
          placeholder="Patient reports..."
          value={subjective}
          onChange={(e) => setSubjective(e.target.value)}
          rows={3}
          className="bg-white/70"
        />
      </div>

      {/* Objective */}
      <div className={SECTION_STYLES.objective}>
        <Label className="text-emerald-700 font-semibold text-sm mb-1.5 block">
          Objective (O)
        </Label>
        <p className="text-xs text-emerald-600/70 mb-2">
          Clinical observations, measurements, test results, ROM findings
        </p>
        <Textarea
          placeholder="On examination..."
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          rows={3}
          className="bg-white/70"
        />
      </div>

      {/* Assessment */}
      <div className={SECTION_STYLES.assessment}>
        <Label className="text-amber-700 font-semibold text-sm mb-1.5 block">
          Assessment (A)
        </Label>
        <p className="text-xs text-amber-600/70 mb-2">
          Diagnosis, clinical reasoning, progress toward goals
        </p>
        <Textarea
          placeholder="Assessment indicates..."
          value={assessment}
          onChange={(e) => setAssessment(e.target.value)}
          rows={3}
          className="bg-white/70"
        />
      </div>

      {/* Plan */}
      <div className={SECTION_STYLES.plan}>
        <Label className="text-violet-700 font-semibold text-sm mb-1.5 block">
          Plan (P)
        </Label>
        <p className="text-xs text-violet-600/70 mb-2">
          Treatment plan, exercises prescribed, follow-up schedule
        </p>
        <Textarea
          placeholder="Plan includes..."
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          rows={3}
          className="bg-white/70"
        />
      </div>

      {/* Private Notes — clinician-only */}
      <div className={SECTION_STYLES.private}>
        <Label className="text-slate-600 font-semibold text-sm mb-1.5 block">
          Private Notes (clinician only)
        </Label>
        <p className="text-xs text-muted-foreground mb-2">
          Internal observations not visible to the patient
        </p>
        <Textarea
          placeholder="Internal notes..."
          value={privateNotes}
          onChange={(e) => setPrivateNotes(e.target.value)}
          rows={2}
          className="bg-white/70"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending
            ? "Saving..."
            : isEditing
            ? "Update Note"
            : "Save Note"}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
