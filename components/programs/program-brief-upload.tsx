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
  generateProgramPreviewFromBriefAction,
  saveGeneratedProgramAction,
} from "@/actions/program-actions";
import { toast } from "sonner";
import {
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
    subjective?: string;
    trainerPrompt?: string;
    additionalNotes?: string;
  };
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
  const [processing, setProcessing] = useState(false);
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
  }

  async function handleUploadAndGenerate() {
    toast.error("Brief upload is temporarily unavailable.");
  }

  async function handleSave(isTemplate: boolean) {
    if (!preview) return;
    if (!isTemplate && !assignClientId) {
      toast.error("Select a client to assign");
      return;
    }

    setSaving(isTemplate ? "template" : "assign");
    try {
      const result = await saveGeneratedProgramAction({
        aiPlan: preview.aiPlan,
        params: preview.params,
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
                Freeform briefs are supported. AI infers missing fields from your content.
              </p>
              <Link
                className="text-sm text-blue-600 hover:underline"
                href="/templates/program-brief-template.txt"
                target="_blank"
              >
                Download template
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
              <p className="text-sm text-muted-foreground w-full text-center">File upload is temporarily unavailable.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Review Generated Program
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Program Title</Label>
                <div className="text-sm font-medium">
                  {preview.parsed.programTitle}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <div className="text-sm font-medium">
                  {preview.parsed.difficultyLevel}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Focus Areas</Label>
                <div className="flex flex-wrap gap-1">
                  {preview.parsed.focusAreas.map((area) => (
                    <Badge key={area} variant="secondary">
                      {area}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Schedule</Label>
                <div className="text-sm">
                  {preview.parsed.daysPerWeek} days / week — {preview.parsed.preferredWeekdays.join(", ")}
                </div>
              </div>
            </div>

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
