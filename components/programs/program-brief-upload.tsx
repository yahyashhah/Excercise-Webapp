"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  generateProgramBriefUploadUrlAction,
  extractProgramMetadataFromBriefAction,
  generateProgramPreviewFromBriefAction,
  saveGeneratedProgramAction,
} from "@/actions/program-actions";
import type { BriefMetadata } from "@/lib/services/program-brief.service";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";

interface Props {
  clients: { id: string; firstName: string; lastName: string }[];
}

type PreviewState = {
  aiPlan: {
    name: string;
    description?: string;
    workouts: {
      name: string;
      dayIndex: number;
      weekIndex: number;
      blocks: {
        name?: string;
        type: string;
        orderIndex: number;
        exercises: {
          exerciseId: string;
          exerciseName?: string;
          orderIndex: number;
          sets: number;
          reps: string;
        }[];
      }[];
    }[];
  };
  params: Record<string, unknown>;
  parsed: {
    programTitle: string;
    focusAreas: string[];
    difficultyLevel: string;
    durationMinutes: number;
    daysPerWeek: number;
    preferredWeekdays: string[];
    circuits: { name: string; focusType: string; exerciseCount: number }[];
    inferredFields?: string[];
  };
  warnings: string[];
};

const DIFFICULTY_OPTIONS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

// Schedule is deliberately NOT in here — it gets baked into the generated
// program's day assignments during generation, so it must be confirmed
// BEFORE generation (see PendingSchedule below), not edited after the fact.
type EditableFields = {
  programTitle: string;
  difficultyLevel: string;
  durationMinutes: string;
  focusAreas: string;
};

function toEditableFields(parsed: PreviewState["parsed"]): EditableFields {
  return {
    programTitle: parsed.programTitle,
    difficultyLevel: parsed.difficultyLevel,
    durationMinutes: String(parsed.durationMinutes),
    focusAreas: parsed.focusAreas.join(", "),
  };
}

type PendingSchedule = {
  rawText: string;
  metadata: BriefMetadata;
};

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

function formatFileName(name: string) {
  return name.length > 48 ? `${name.slice(0, 45)}...` : name;
}

function isAllowedFile(file: File) {
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function ProgramBriefUpload({ clients }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [editableFields, setEditableFields] = useState<EditableFields | null>(null);
  const [pendingSchedule, setPendingSchedule] = useState<PendingSchedule | null>(null);
  const [scheduleInput, setScheduleInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [confirmingSchedule, setConfirmingSchedule] = useState(false);
  const [assignClientId, setAssignClientId] = useState("");
  const [assignStartDate, setAssignStartDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [saving, setSaving] = useState<"template" | "assign" | null>(null);

  function handleFileChange(files: FileList | null) {
    if (!files || !files.length) return;
    const next = files[0];
    if (!isAllowedFile(next)) {
      toast.error("Only PDF, DOCX, TXT, or Markdown files are supported");
      return;
    }
    setFile(next);
    setPreview(null);
    setPendingSchedule(null);
  }

  async function runGeneration(rawText: string, metadata: BriefMetadata) {
    const result = await generateProgramPreviewFromBriefAction({ rawText, metadata });
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Failed to generate program from brief");
      return;
    }
    setPreview(result.data);
    setEditableFields(toEditableFields(result.data.parsed));
    toast.success("Preview generated");
  }

  async function handleUploadAndGenerate() {
    if (!file) return;

    setProcessing(true);
    try {
      const extension = file.name.toLowerCase().split(".").pop() ?? "";
      const presignResult = await generateProgramBriefUploadUrlAction(extension);
      if (!presignResult.success || !presignResult.data) {
        toast.error(presignResult.error ?? "Failed to get upload URL");
        return;
      }
      const { presignedUrl, fileUrl, contentType } = presignResult.data;

      const uploadResp = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": contentType },
      });
      if (!uploadResp.ok) {
        toast.error("Upload to storage failed. Please try again.");
        return;
      }

      const metaResult = await extractProgramMetadataFromBriefAction({
        fileUrl,
        fileName: file.name,
      });
      if (!metaResult.success || !metaResult.data) {
        toast.error(metaResult.error ?? "Failed to read this document");
        return;
      }

      const { metadata, rawText } = metaResult.data;
      const scheduleIsInferred =
        metadata.inferredFields.includes("preferredWeekdays") ||
        metadata.inferredFields.includes("estimatedDaysPerWeek");

      if (scheduleIsInferred) {
        // Schedule gets baked into the generated program's day assignments
        // during generation, so it has to be confirmed now, before the
        // (slower) generation step runs — not edited afterward.
        setPendingSchedule({ rawText, metadata });
        setScheduleInput(metadata.preferredWeekdays.join(", "));
        return;
      }

      await runGeneration(rawText, metadata);
    } catch (err) {
      console.error("[program-brief-upload]", err);
      toast.error("Upload failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  async function handleConfirmSchedule() {
    if (!pendingSchedule) return;
    const weekdays = scheduleInput
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    if (!weekdays.length) {
      toast.error("Enter at least one training day");
      return;
    }

    setConfirmingSchedule(true);
    try {
      const confirmedMetadata: BriefMetadata = {
        ...pendingSchedule.metadata,
        preferredWeekdays: weekdays,
        estimatedDaysPerWeek: weekdays.length,
        inferredFields: pendingSchedule.metadata.inferredFields.filter(
          (f) => f !== "preferredWeekdays" && f !== "estimatedDaysPerWeek"
        ),
      };
      await runGeneration(pendingSchedule.rawText, confirmedMetadata);
      setPendingSchedule(null);
    } finally {
      setConfirmingSchedule(false);
    }
  }

  async function handleSave(isTemplate: boolean) {
    if (!preview || !editableFields) return;
    if (!isTemplate && !assignClientId) {
      toast.error("Select a client to assign");
      return;
    }

    setSaving(isTemplate ? "template" : "assign");
    try {
      const editedTitle = editableFields.programTitle.trim() || preview.parsed.programTitle;
      const editedFocusAreas = editableFields.focusAreas
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const editedDuration = Number.parseInt(editableFields.durationMinutes, 10);

      const result = await saveGeneratedProgramAction({
        aiPlan: { ...preview.aiPlan, name: editedTitle },
        params: {
          ...preview.params,
          programTitle: editedTitle,
          difficultyLevel: editableFields.difficultyLevel,
          durationMinutes: Number.isFinite(editedDuration) ? editedDuration : preview.parsed.durationMinutes,
          focusAreas: editedFocusAreas.length ? editedFocusAreas : preview.parsed.focusAreas,
        },
        isTemplate,
        clientId: isTemplate ? null : assignClientId,
        startDate: isTemplate ? undefined : assignStartDate,
      });

      if (result.success) {
        toast.success(isTemplate ? "Program saved" : "Program assigned and saved");
        router.push(`/programs/${result.data}`);
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Upload Program Brief
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Any format works — tables, bullet lists, or plain prose. Not sure where to start?
              </p>
              <Link
                className="text-sm text-blue-600 hover:underline"
                href="/templates/program-brief-template.txt"
                target="_blank"
              >
                See an example document
              </Link>
            </div>
            <Badge variant="outline" className="w-fit">
              Supported: PDF, DOCX, TXT, MD
            </Badge>
          </div>

          <div className="border border-dashed rounded-lg p-6 text-center space-y-3">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(",")}
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files)}
            />
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="text-sm">
              {file ? (
                <span className="font-medium">{formatFileName(file.name)}</span>
              ) : (
                "Choose a program brief file"
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={processing}
              >
                Select File
              </Button>
              <Button
                onClick={handleUploadAndGenerate}
                disabled={!file || processing}
                className="gap-2"
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate Preview
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {pendingSchedule && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-amber-600" />
              Confirm Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This document doesn&apos;t state which days of the week training happens on. This
              determines which day each session lands on, so please confirm it before the program
              is generated.
            </p>
            <div className="space-y-2">
              <Label>Training days (comma separated)</Label>
              <Input
                value={scheduleInput}
                onChange={(e) => setScheduleInput(e.target.value)}
                placeholder="Monday, Wednesday, Friday"
              />
            </div>
            <Button onClick={handleConfirmSchedule} disabled={confirmingSchedule} className="gap-2">
              {confirmingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {confirmingSchedule ? "Generating..." : "Continue"}
            </Button>
          </CardContent>
        </Card>
      )}

      {preview && editableFields && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Review Generated Program
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {preview.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Review before saving
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {preview.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {(() => {
              const inferred = new Set(preview.parsed.inferredFields ?? []);
              const inferredNote = (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Not stated in the document — please confirm.
                </p>
              );
              return (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Program Title</Label>
                    <Input
                      value={editableFields.programTitle}
                      onChange={(e) =>
                        setEditableFields((f) => (f ? { ...f, programTitle: e.target.value } : f))
                      }
                      className={inferred.has("programTitle") ? "border-amber-400" : undefined}
                    />
                    {inferred.has("programTitle") && inferredNote}
                  </div>
                  <div className="space-y-2">
                    <Label>Difficulty</Label>
                    <Select
                      value={editableFields.difficultyLevel}
                      onValueChange={(v) =>
                        setEditableFields((f) => (f ? { ...f, difficultyLevel: v ?? f.difficultyLevel } : f))
                      }
                    >
                      <SelectTrigger className={inferred.has("difficultyLevel") ? "border-amber-400" : undefined}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIFFICULTY_OPTIONS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {inferred.has("difficultyLevel") && inferredNote}
                  </div>
                  <div className="space-y-2">
                    <Label>Focus Areas (comma separated)</Label>
                    <Input
                      value={editableFields.focusAreas}
                      onChange={(e) =>
                        setEditableFields((f) => (f ? { ...f, focusAreas: e.target.value } : f))
                      }
                      className={inferred.has("focusAreas") ? "border-amber-400" : undefined}
                    />
                    {inferred.has("focusAreas") && inferredNote}
                  </div>
                  <div className="space-y-2">
                    <Label>Schedule</Label>
                    <div className="text-sm font-medium">
                      {preview.parsed.daysPerWeek} days/week — {preview.parsed.preferredWeekdays.join(", ")}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Confirmed before generation — already reflected in the sessions below.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Session Length (minutes)</Label>
                    <Input
                      type="number"
                      value={editableFields.durationMinutes}
                      onChange={(e) =>
                        setEditableFields((f) => (f ? { ...f, durationMinutes: e.target.value } : f))
                      }
                      className={inferred.has("durationMinutes") ? "border-amber-400" : undefined}
                    />
                    {inferred.has("durationMinutes") && inferredNote}
                  </div>
                </div>
              );
            })()}

            <div className="space-y-2">
              <Label>Generated Sessions</Label>
              <div className="space-y-3">
                {preview.aiPlan.workouts.map((workout, idx) => (
                  <div key={`${workout.name}-${idx}`} className="border rounded-lg p-4">
                    <div className="font-medium">{workout.name}</div>
                    <div className="mt-3 space-y-3">
                      {workout.blocks.map((block, bIdx) => (
                        <div key={`${block.name || block.type}-${bIdx}`}>
                          <div className="text-sm font-semibold flex items-center gap-2">
                            <span>{block.name || "Block"}</span>
                            {block.type !== "NORMAL" && (
                              <Badge variant="outline">{block.type}</Badge>
                            )}
                          </div>
                          <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
                            {block.exercises.map((ex, eIdx) => (
                              <div key={`${ex.exerciseId}-${eIdx}`}>
                                {ex.exerciseName || ex.exerciseId} — {ex.sets} x {ex.reps}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Assign to Client (optional)</Label>
                  <Select
                    value={assignClientId}
                    onValueChange={(v) => setAssignClientId(v ?? "")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.firstName} {p.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={assignStartDate}
                    onChange={(e) => setAssignStartDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleSave(true)}
                  disabled={saving !== null}
                >
                  {saving === "template" ? "Saving..." : "Save as Template"}
                </Button>
                <Button
                  onClick={() => handleSave(false)}
                  disabled={saving !== null}
                >
                  {saving === "assign" ? "Assigning..." : "Save & Assign"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
