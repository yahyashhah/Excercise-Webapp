"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BODY_REGIONS, DIFFICULTY_LEVELS, COMMON_EQUIPMENT } from "@/lib/utils/constants";
import { bulkCreateExercisesAction, type BulkExerciseInput } from "@/actions/bulk-exercise-actions";
import { useUploadThing } from "@/lib/uploadthing-client";
import { isYouTubeUrl } from "@/lib/utils/video";
import { toast } from "sonner";
import {
  Loader2, Sparkles, ChevronDown, ChevronUp,
  Trash2, CheckCircle2, CloudUpload, Video,
  AlertCircle, FileVideo, X, Youtube, Link2,
} from "lucide-react";

const EXERCISE_PHASES = [
  { value: "WARMUP", label: "Warm-up" },
  { value: "ACTIVATION", label: "Activation" },
  { value: "STRENGTHENING", label: "Strengthening" },
  { value: "MOBILITY", label: "Mobility" },
  { value: "COOLDOWN", label: "Cool-down" },
] as const;

type AiStatus = "idle" | "loading" | "done" | "error";
type ImportMode = "upload" | "youtube";

interface ExerciseRow {
  rowId: string;
  videoUrl: string;
  videoFileName: string;
  imageUrl: string;
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

function makeRow(videoUrl: string, videoFileName: string, imageUrl = ""): ExerciseRow {
  return {
    rowId: crypto.randomUUID(),
    videoUrl,
    videoFileName,
    imageUrl,
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

function parseYoutubeUrls(raw: string): string[] {
  return raw
    .split(/[\n,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && isYouTubeUrl(s));
}

// ─── Main component ──────────────────────────────────────────────────────────

export function BulkImportForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<ImportMode>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [youtubeInput, setYoutubeInput] = useState("");
  const [ytProcessing, setYtProcessing] = useState(false);
  const [ytProgress, setYtProgress] = useState({ done: 0, total: 0 });

  const [rows, setRows] = useState<ExerciseRow[]>([]);
  const [publishing, setPublishing] = useState(false);

  const { startUpload, isUploading } = useUploadThing("bulkExerciseVideos", {
    onUploadProgress: setUploadProgress,
    onClientUploadComplete: (res) => {
      if (!res?.length) return;
      setRows((prev) => [...prev, ...res.map((f) => makeRow(f.ufsUrl, f.name))]);
      setSelectedFiles([]);
      setUploadProgress(0);
      toast.success(`${res.length} video${res.length === 1 ? "" : "s"} uploaded`);
    },
    onUploadError: (error) => {
      setUploadProgress(0);
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  // ── File helpers ────────────────────────────────────────────────────────────

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const videoFiles = Array.from(files).filter((f) => f.type.startsWith("video/"));
    if (!videoFiles.length) { toast.error("Please select video files only"); return; }
    if (selectedFiles.length + videoFiles.length > 30) { toast.error("Maximum 30 videos at a time"); return; }
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

  // ── YouTube processing ───────────────────────────────────────────────────────

  async function processYoutubeUrls() {
    const urls = parseYoutubeUrls(youtubeInput);
    if (!urls.length) { toast.error("No valid YouTube URLs found"); return; }
    if (urls.length > 30) { toast.error("Maximum 30 URLs at a time"); return; }

    setYtProcessing(true);
    setYtProgress({ done: 0, total: urls.length });
    let successCount = 0;

    for (const url of urls) {
      try {
        const res = await fetch("/api/ai/generate-exercise-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtubeUrl: url }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(`Skipped one URL: ${err.error ?? "failed"}`);
          setYtProgress((p) => ({ ...p, done: p.done + 1 }));
          continue;
        }

        const { data: d } = await res.json();
        const newRow = makeRow(d.videoUrl ?? url, d.exerciseName ?? url, d.imageUrl ?? "");
        newRow.name = d.exerciseName ?? "";
        newRow.description = d.description ?? "";
        newRow.instructions = d.instructions ?? "";
        newRow.bodyRegion = d.bodyRegion ?? "";
        newRow.difficultyLevel = d.difficultyLevel ?? "";
        newRow.exercisePhase = d.exercisePhase ?? "";
        newRow.musclesTargeted = (d.musclesTargeted ?? []).join(", ");
        newRow.equipmentRequired = d.equipmentRequired ?? [];
        newRow.contraindications = (d.contraindications ?? []).join(", ");
        newRow.commonMistakes = d.commonMistakes ?? "";
        newRow.defaultSets = String(d.defaultSets ?? 3);
        newRow.defaultReps = String(d.defaultReps ?? 10);
        newRow.aiStatus = "done";

        setRows((prev) => [...prev, newRow]);
        successCount++;
      } catch {
        toast.error("Failed to process one URL — skipped");
      }
      setYtProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setYtProcessing(false);
    setYtProgress({ done: 0, total: 0 });
    if (successCount > 0) {
      setYoutubeInput("");
      toast.success(`${successCount} exercise${successCount === 1 ? "" : "s"} generated from YouTube`);
    }
  }

  // ── Row helpers ─────────────────────────────────────────────────────────────

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
        return { ...r, equipmentRequired: has ? r.equipmentRequired.filter((e) => e !== item) : [...r.equipmentRequired, item] };
      })
    );
  }

  async function generateMetadata(rowId: string) {
    const row = rows.find((r) => r.rowId === rowId);
    if (!row?.name.trim()) { toast.error("Enter an exercise name first"); return; }
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
    if (!pending.length) { toast.error("Name the exercises first, then generate all"); return; }
    for (const row of pending) await generateMetadata(row.rowId);
  }

  // ── Publish ─────────────────────────────────────────────────────────────────

  const readyCount = rows.filter((r) => r.name.trim() && r.bodyRegion && r.difficultyLevel).length;

  async function handlePublish() {
    const ready = rows.filter((r) => r.name.trim() && r.bodyRegion && r.difficultyLevel);
    if (!ready.length) { toast.error("Each exercise needs a name, body region, and difficulty"); return; }
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
      imageUrl: r.imageUrl || undefined,
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

  // ── Derived ─────────────────────────────────────────────────────────────────

  const ytUrls = parseYoutubeUrls(youtubeInput);
  const ytProgressPct = ytProgress.total > 0 ? Math.round((ytProgress.done / ytProgress.total) * 100) : 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Mode tabs ── */}
      <div className="flex gap-1 rounded-xl border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            mode === "upload"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <CloudUpload className="h-4 w-4" />
          Upload Video Files
        </button>
        <button
          type="button"
          onClick={() => setMode("youtube")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            mode === "youtube"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <Youtube className="h-4 w-4" />
          Import from YouTube
        </button>
      </div>

      {/* ── Upload panel ── */}
      {mode === "upload" && (
        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          />

          {isUploading ? (
            <div className="rounded-xl border bg-background p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="font-medium">Uploading your videos…</p>
                <span className="ml-auto text-sm font-semibold text-primary">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
              <p className="mt-2 text-xs text-muted-foreground">Do not close this tab while uploading</p>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={[
                "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-colors",
                dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50",
              ].join(" ")}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-background shadow-sm">
                <CloudUpload className={`h-8 w-8 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="text-base font-semibold">Drop your videos here</p>
                <p className="mt-1 text-sm text-muted-foreground">or click to browse — select as many as you want</p>
              </div>
              <p className="text-xs text-muted-foreground">MP4, MOV, AVI &nbsp;·&nbsp; Up to 30 videos &nbsp;·&nbsp; 64 MB each</p>
            </div>
          )}

          {selectedFiles.length > 0 && !isUploading && (
            <div className="rounded-xl border bg-background shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <p className="text-sm font-medium">
                  {selectedFiles.length} video{selectedFiles.length === 1 ? "" : "s"} selected
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setSelectedFiles([])}>
                    Clear all
                  </Button>
                  <Button size="sm" onClick={() => startUpload(selectedFiles)}>
                    <CloudUpload className="mr-2 h-4 w-4" />
                    Upload {selectedFiles.length} Video{selectedFiles.length === 1 ? "" : "s"}
                  </Button>
                </div>
              </div>
              <ul className="max-h-60 divide-y overflow-y-auto">
                {selectedFiles.map((file, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <FileVideo className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                    <button type="button" onClick={() => setSelectedFiles((prev) => prev.filter((_, idx) => idx !== i))} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── YouTube panel ── */}
      {mode === "youtube" && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-background shadow-sm">
            <div className="border-b px-5 py-4">
              <p className="font-medium">Paste YouTube URLs</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                One URL per line — the AI will fetch each video&apos;s title and generate professional exercise metadata automatically.
              </p>
            </div>
            <div className="p-4 space-y-3">
              <Textarea
                placeholder={`https://www.youtube.com/watch?v=abc123\nhttps://youtu.be/def456\nhttps://www.youtube.com/watch?v=ghi789`}
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                rows={6}
                className="font-mono text-sm resize-none"
                disabled={ytProcessing}
              />

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {ytUrls.length > 0
                    ? <span className="text-foreground font-medium">{ytUrls.length} valid YouTube URL{ytUrls.length === 1 ? "" : "s"} detected</span>
                    : "Paste YouTube links above"
                  }
                </p>
                <Button
                  onClick={processYoutubeUrls}
                  disabled={ytUrls.length === 0 || ytProcessing}
                >
                  {ytProcessing
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Sparkles className="mr-2 h-4 w-4" />
                  }
                  {ytProcessing
                    ? `Processing ${ytProgress.done + 1} of ${ytProgress.total}…`
                    : `Generate ${ytUrls.length > 0 ? ytUrls.length : ""} Exercise${ytUrls.length === 1 ? "" : "s"}`
                  }
                </Button>
              </div>

              {ytProcessing && (
                <div className="space-y-1">
                  <Progress value={ytProgressPct} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    AI is analyzing each video and generating clinical metadata… this takes a few seconds per video.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Youtube className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Works best with exercise-specific YouTube videos — the video title is used to generate the exercise name and all clinical details. Videos like &ldquo;Seated Knee Extension — Senior Physical Therapy&rdquo; produce excellent results.
            </p>
          </div>
        </div>
      )}

      {/* ── Exercise cards ── */}
      {rows.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">
                Review & Edit — {rows.length} Exercise{rows.length === 1 ? "" : "s"}
              </h3>
              <p className="text-sm text-muted-foreground">
                AI-filled fields are editable. At minimum each exercise needs a name, body region, and difficulty.
              </p>
            </div>
            <div className="flex gap-2">
              {mode === "upload" && (
                <Button variant="outline" onClick={generateAll} disabled={publishing || isUploading || ytProcessing}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate All
                </Button>
              )}
            </div>
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

          {/* Sticky publish bar */}
          <div className="sticky bottom-4 z-10">
            <div className="flex items-center justify-between rounded-xl border bg-background px-5 py-4 shadow-lg">
              <div>
                <p className="font-semibold">
                  {readyCount} of {rows.length} ready to publish
                </p>
                <p className="text-xs text-muted-foreground">
                  Needs name + body region + difficulty
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.back()} disabled={publishing}>Cancel</Button>
                <Button onClick={handlePublish} disabled={publishing || readyCount === 0 || isUploading || ytProcessing}>
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
  const isYT = isYouTubeUrl(row.videoUrl);

  return (
    <div className={`rounded-xl border bg-background shadow-sm transition-colors ${isReady ? "border-green-200" : ""}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
          {index + 1}
        </span>
        {isYT ? (
          <Youtube className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <p className="flex-1 truncate text-sm text-muted-foreground">{row.videoFileName || row.videoUrl}</p>
        {isReady && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />}
        {row.aiStatus === "done" && (
          <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
            <Sparkles className="h-3 w-3" /> AI filled
          </Badge>
        )}
        {row.aiStatus === "error" && (
          <Badge variant="destructive" className="shrink-0 gap-1 text-xs">
            <AlertCircle className="h-3 w-3" /> Retry AI
          </Badge>
        )}
        <button type="button" onClick={() => onUpdate({ expanded: !row.expanded })} className="rounded p-1 text-muted-foreground hover:text-foreground">
          {row.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button type="button" onClick={onRemove} className="rounded p-1 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Name + AI button */}
      <div className="flex gap-2 border-t px-4 py-3">
        <Input
          placeholder="Exercise name"
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

      {/* Expanded fields */}
      {row.expanded && (
        <div className="space-y-4 border-t px-4 pb-5 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Body Region *</Label>
              <select value={row.bodyRegion} onChange={(e) => onUpdate({ bodyRegion: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select…</option>
                {BODY_REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Difficulty *</Label>
              <select value={row.difficultyLevel} onChange={(e) => onUpdate({ difficultyLevel: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select…</option>
                {DIFFICULTY_LEVELS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Phase</Label>
              <select value={row.exercisePhase} onChange={(e) => onUpdate({ exercisePhase: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
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
            <Label className="text-xs font-medium">Muscles Targeted <span className="font-normal text-muted-foreground">(comma separated)</span></Label>
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
            <Label className="text-xs font-medium">Contraindications <span className="font-normal text-muted-foreground">(comma separated)</span></Label>
            <Input value={row.contraindications} onChange={(e) => onUpdate({ contraindications: e.target.value })} placeholder="e.g. Acute knee injury, Recent hip replacement" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Common Mistakes</Label>
            <Textarea rows={2} value={row.commonMistakes} onChange={(e) => onUpdate({ commonMistakes: e.target.value })} placeholder="Frequent form errors and corrections" />
          </div>
        </div>
      )}
    </div>
  );
}
