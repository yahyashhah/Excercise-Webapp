"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BODY_REGIONS, DIFFICULTY_LEVELS, COMMON_EQUIPMENT } from "@/lib/utils/constants";
import { bulkCreateExercisesAction, type BulkExerciseInput } from "@/actions/bulk-exercise-actions";
import { useUploadThing } from "@/lib/uploadthing-client";
import { toast } from "sonner";
import {
  Loader2, Sparkles, ChevronDown, ChevronUp,
  Trash2, CheckCircle2, CloudUpload, Video,
  AlertCircle, FileVideo, X,
} from "lucide-react";

const EXERCISE_PHASES = [
  { value: "WARMUP", label: "Warm-up" },
  { value: "ACTIVATION", label: "Activation" },
  { value: "STRENGTHENING", label: "Strengthening" },
  { value: "MOBILITY", label: "Mobility" },
  { value: "COOLDOWN", label: "Cool-down" },
] as const;

type AiStatus = "idle" | "loading" | "done" | "error";

interface ExerciseRow {
  rowId: string;
  videoUrl: string;
  videoFileName: string;
  name: string;
  description: string;
  instructions: string;
  bodyRegion: string;
  difficultyLevel: string;
  exercisePhase: string;
  musclesTargeted: string;
  equipmentRequired: string[];
  contraindications: string;
  commonMistakes: string;
  defaultSets: string;
  defaultReps: string;
  aiStatus: AiStatus;
  expanded: boolean;
}

function makeRow(videoUrl: string, videoFileName: string): ExerciseRow {
  return {
    rowId: crypto.randomUUID(),
    videoUrl,
    videoFileName,
    name: "",
    description: "",
    instructions: "",
    bodyRegion: "",
    difficultyLevel: "",
    exercisePhase: "",
    musclesTargeted: "",
    equipmentRequired: [],
    contraindications: "",
    commonMistakes: "",
    defaultSets: "3",
    defaultReps: "10",
    aiStatus: "idle",
    expanded: true,
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function BulkImportForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [rows, setRows] = useState<ExerciseRow[]>([]);
  const [publishing, setPublishing] = useState(false);

  const { startUpload, isUploading } = useUploadThing("bulkExerciseVideos", {
    onUploadProgress: setUploadProgress,
    onClientUploadComplete: (res) => {
      if (!res?.length) return;
      setRows((prev) => [...prev, ...res.map((f) => makeRow(f.ufsUrl, f.name))]);
      setSelectedFiles([]);
      setUploadProgress(0);
      toast.success(`${res.length} video${res.length === 1 ? "" : "s"} uploaded successfully`);
    },
    onUploadError: (error) => {
      setUploadProgress(0);
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const videoFiles = Array.from(files).filter((f) => f.type.startsWith("video/"));
    if (!videoFiles.length) {
      toast.error("Please select video files only");
      return;
    }
    const total = selectedFiles.length + videoFiles.length;
    if (total > 30) {
      toast.error("Maximum 30 videos at a time");
      return;
    }
    setSelectedFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...videoFiles.filter((f) => !names.has(f.name))];
    });
  }, [selectedFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  async function handleUpload() {
    if (!selectedFiles.length) return;
    await startUpload(selectedFiles);
  }

  function updateRow(rowId: string, patch: Partial<ExerciseRow>) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  function removeRow(rowId: string) {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  }

  function toggleEquipment(rowId: string, item: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        const has = r.equipmentRequired.includes(item);
        return {
          ...r,
          equipmentRequired: has
            ? r.equipmentRequired.filter((e) => e !== item)
            : [...r.equipmentRequired, item],
        };
      })
    );
  }

  async function generateMetadata(rowId: string) {
    const row = rows.find((r) => r.rowId === rowId);
    if (!row?.name.trim()) {
      toast.error("Enter an exercise name first");
      return;
    }
    updateRow(rowId, { aiStatus: "loading" });
    try {
      const res = await fetch("/api/ai/generate-exercise-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: row.name }),
      });
      if (!res.ok) throw new Error();
      const { data: d } = await res.json();
      updateRow(rowId, {
        aiStatus: "done",
        description: d.description ?? "",
        instructions: d.instructions ?? "",
        bodyRegion: d.bodyRegion ?? "",
        difficultyLevel: d.difficultyLevel ?? "",
        exercisePhase: d.exercisePhase ?? "",
        musclesTargeted: (d.musclesTargeted ?? []).join(", "),
        equipmentRequired: d.equipmentRequired ?? [],
        contraindications: (d.contraindications ?? []).join(", "),
        commonMistakes: d.commonMistakes ?? "",
        defaultSets: String(d.defaultSets ?? 3),
        defaultReps: String(d.defaultReps ?? 10),
      });
      toast.success(`Metadata generated for "${row.name}"`);
    } catch {
      updateRow(rowId, { aiStatus: "error" });
      toast.error("AI generation failed — try again");
    }
  }

  async function generateAll() {
    const pending = rows.filter((r) => r.name.trim() && r.aiStatus === "idle");
    if (!pending.length) {
      toast.error("Name the exercises first, then generate all");
      return;
    }
    for (const row of pending) await generateMetadata(row.rowId);
  }

  const readyCount = rows.filter((r) => r.name.trim() && r.bodyRegion && r.difficultyLevel).length;

  async function handlePublish() {
    const ready = rows.filter((r) => r.name.trim() && r.bodyRegion && r.difficultyLevel);
    if (!ready.length) {
      toast.error("Each exercise needs a name, body region, and difficulty");
      return;
    }
    setPublishing(true);
    const payload: BulkExerciseInput[] = ready.map((r) => ({
      name: r.name.trim(),
      description: r.description || undefined,
      instructions: r.instructions || undefined,
      bodyRegion: r.bodyRegion,
      difficultyLevel: r.difficultyLevel,
      exercisePhase: r.exercisePhase || undefined,
      musclesTargeted: r.musclesTargeted.split(",").map((s) => s.trim()).filter(Boolean),
      equipmentRequired: r.equipmentRequired,
      contraindications: r.contraindications.split(",").map((s) => s.trim()).filter(Boolean),
      commonMistakes: r.commonMistakes || undefined,
      defaultSets: parseInt(r.defaultSets) || undefined,
      defaultReps: parseInt(r.defaultReps) || undefined,
      videoUrl: r.videoUrl || undefined,
    }));
    const result = await bulkCreateExercisesAction(payload);
    setPublishing(false);
    if (result.success) {
      toast.success(`${result.count} exercise${result.count === 1 ? "" : "s"} added to library`);
      router.push("/exercises");
    } else {
      toast.error(result.error);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const showDropzone = !isUploading && rows.length === 0;
  const showFileList = selectedFiles.length > 0 && !isUploading;

  return (
    <div className="space-y-8">

      {/* ── Upload zone ── */}
      {!isUploading && (
        <div className="space-y-4">
          {/* Hidden native file input — accepts multiple */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {/* Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={[
              "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-colors",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50",
            ].join(" ")}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-background shadow-sm">
              <CloudUpload className={`h-8 w-8 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-base font-semibold">Drop your videos here</p>
              <p className="mt-1 text-sm text-muted-foreground">or click anywhere to browse your files</p>
            </div>
            <p className="text-xs text-muted-foreground">
              MP4, MOV, AVI &nbsp;·&nbsp; Up to 30 videos &nbsp;·&nbsp; 64 MB each
            </p>
            {rows.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                Add More Videos
              </Button>
            )}
          </div>

          {/* Selected file list (pre-upload preview) */}
          {showFileList && (
            <div className="rounded-xl border bg-background shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <p className="text-sm font-medium">
                  {selectedFiles.length} video{selectedFiles.length === 1 ? "" : "s"} selected
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => setSelectedFiles([])}
                  >
                    Clear all
                  </Button>
                  <Button size="sm" onClick={handleUpload}>
                    <CloudUpload className="mr-2 h-4 w-4" />
                    Upload {selectedFiles.length} Video{selectedFiles.length === 1 ? "" : "s"}
                  </Button>
                </div>
              </div>
              <ul className="divide-y max-h-64 overflow-y-auto">
                {selectedFiles.map((file, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <FileVideo className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Upload progress ── */}
      {isUploading && (
        <div className="rounded-xl border bg-background p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="font-medium">Uploading your videos…</p>
            <span className="ml-auto text-sm font-semibold text-primary">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            Do not close this tab while uploading
          </p>
        </div>
      )}

      {/* ── Exercise cards ── */}
      {rows.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">Add Exercise Details</h3>
              <p className="text-sm text-muted-foreground">
                Type a name for each exercise, then click <strong>AI Generate</strong> to fill in the rest automatically.
              </p>
            </div>
            <Button variant="outline" onClick={generateAll} disabled={publishing || isUploading}>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate All
            </Button>
          </div>

          <div className="space-y-3">
            {rows.map((row, index) => (
              <ExerciseRowCard
                key={row.rowId}
                row={row}
                index={index}
                onUpdate={(patch) => updateRow(row.rowId, patch)}
                onRemove={() => removeRow(row.rowId)}
                onGenerate={() => generateMetadata(row.rowId)}
                onToggleEquipment={(item) => toggleEquipment(row.rowId, item)}
              />
            ))}
          </div>

          {/* Publish bar */}
          <div className="sticky bottom-4 z-10">
            <div className="flex items-center justify-between rounded-xl border bg-background px-5 py-4 shadow-lg">
              <div>
                <p className="font-semibold">
                  {readyCount} of {rows.length} ready to publish
                </p>
                <p className="text-xs text-muted-foreground">
                  Name + body region + difficulty required
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.back()} disabled={publishing}>
                  Cancel
                </Button>
                <Button onClick={handlePublish} disabled={publishing || readyCount === 0 || isUploading}>
                  {publishing
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <CheckCircle2 className="mr-2 h-4 w-4" />
                  }
                  Publish {readyCount > 0 ? readyCount : ""} Exercise{readyCount === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Row card ────────────────────────────────────────────────────────────────

interface RowProps {
  row: ExerciseRow;
  index: number;
  onUpdate: (patch: Partial<ExerciseRow>) => void;
  onRemove: () => void;
  onGenerate: () => void;
  onToggleEquipment: (item: string) => void;
}

function ExerciseRowCard({ row, index, onUpdate, onRemove, onGenerate, onToggleEquipment }: RowProps) {
  const isReady = !!(row.name.trim() && row.bodyRegion && row.difficultyLevel);

  return (
    <div className={`rounded-xl border bg-background shadow-sm transition-colors ${isReady ? "border-green-200" : ""}`}>
      {/* ── Header row ── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
          {index + 1}
        </span>

        <Video className="h-4 w-4 shrink-0 text-muted-foreground" />

        <p className="flex-1 truncate text-sm text-muted-foreground">{row.videoFileName}</p>

        {isReady && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />}
        {row.aiStatus === "done" && (
          <Badge variant="secondary" className="shrink-0 text-xs gap-1">
            <Sparkles className="h-3 w-3" /> AI filled
          </Badge>
        )}
        {row.aiStatus === "error" && (
          <Badge variant="destructive" className="shrink-0 text-xs gap-1">
            <AlertCircle className="h-3 w-3" /> Retry AI
          </Badge>
        )}

        <button
          type="button"
          onClick={() => onUpdate({ expanded: !row.expanded })}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
        >
          {row.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* ── Name + AI button ── always visible */}
      <div className="flex gap-2 border-t px-4 py-3">
        <Input
          placeholder="Exercise name — e.g. Seated Knee Extension"
          value={row.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="flex-1"
        />
        <Button
          type="button"
          variant={row.aiStatus === "done" ? "secondary" : "outline"}
          onClick={onGenerate}
          disabled={row.aiStatus === "loading" || !row.name.trim()}
          className="shrink-0"
        >
          {row.aiStatus === "loading"
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Sparkles className="mr-2 h-4 w-4" />}
          {row.aiStatus === "loading" ? "Generating…" : row.aiStatus === "done" ? "Regenerate" : "AI Generate"}
        </Button>
      </div>

      {/* ── Expanded fields ── */}
      {row.expanded && (
        <div className="space-y-4 border-t px-4 pb-5 pt-4">

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Body Region *</Label>
              <select
                value={row.bodyRegion}
                onChange={(e) => onUpdate({ bodyRegion: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select…</option>
                {BODY_REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Difficulty *</Label>
              <select
                value={row.difficultyLevel}
                onChange={(e) => onUpdate({ difficultyLevel: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select…</option>
                {DIFFICULTY_LEVELS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Phase</Label>
              <select
                value={row.exercisePhase}
                onChange={(e) => onUpdate({ exercisePhase: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select…</option>
                {EXERCISE_PHASES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Sets</Label>
              <Input type="number" min={1} max={10} value={row.defaultSets} onChange={(e) => onUpdate({ defaultSets: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Reps</Label>
              <Input type="number" min={1} max={60} value={row.defaultReps} onChange={(e) => onUpdate({ defaultReps: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Description</Label>
            <Textarea rows={2} value={row.description} onChange={(e) => onUpdate({ description: e.target.value })} placeholder="Clinical description" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Instructions</Label>
            <Textarea rows={3} value={row.instructions} onChange={(e) => onUpdate({ instructions: e.target.value })} placeholder="Step-by-step patient instructions" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Muscles Targeted <span className="text-muted-foreground">(comma separated)</span></Label>
            <Input value={row.musclesTargeted} onChange={(e) => onUpdate({ musclesTargeted: e.target.value })} placeholder="e.g. Quadriceps, Glutes, Hamstrings" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Equipment Required</Label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_EQUIPMENT.map((eq) => (
                <button
                  key={eq}
                  type="button"
                  onClick={() => onToggleEquipment(eq)}
                  className={[
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    row.equipmentRequired.includes(eq)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  ].join(" ")}
                >
                  {eq}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Contraindications <span className="text-muted-foreground">(comma separated)</span></Label>
            <Input value={row.contraindications} onChange={(e) => onUpdate({ contraindications: e.target.value })} placeholder="e.g. Acute knee injury, Recent hip replacement" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Common Mistakes</Label>
            <Textarea rows={2} value={row.commonMistakes} onChange={(e) => onUpdate({ commonMistakes: e.target.value })} placeholder="Frequent form errors and how to correct them" />
          </div>
        </div>
      )}
    </div>
  );
}
