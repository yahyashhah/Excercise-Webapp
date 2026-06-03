"use client";

import { useState, useMemo, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Play, X, Plus, ArrowLeft, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { UniversalVideoPlayer } from "@/components/exercises/universal-video-player";
import { createClinicExerciseAction, toggleExercisePublicAction } from "@/actions/exercise-actions";
import { toast } from "sonner";

interface Exercise {
  id: string;
  name: string;
  bodyRegion: string;
  difficultyLevel: string;
  defaultReps?: number | null;
  musclesTargeted?: string[];
  description?: string | null;
  videoUrl?: string | null;
  videoProvider?: string | null;
  exercisePhase?: string | null;
  source?: string | null;
  organizationId?: string | null;
  isPublic?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: Exercise[];
  onSelect: (exercise: Exercise) => void;
  clinicOrganizationId?: string | null;
}

const PHASES = [
  { value: "all",           label: "All"          },
  { value: "WARMUP",        label: "Warm-up"      },
  { value: "ACTIVATION",    label: "Activation"   },
  { value: "STRENGTHENING", label: "Strengthening" },
  { value: "MOBILITY",      label: "Mobility"     },
  { value: "COOLDOWN",      label: "Cool-down"    },
] as const;

const REGIONS = [
  { value: "all",         label: "All"         },
  { value: "UPPER_BODY",  label: "Upper"       },
  { value: "LOWER_BODY",  label: "Lower"       },
  { value: "CORE",        label: "Core"        },
  { value: "FULL_BODY",   label: "Full Body"   },
  { value: "BALANCE",     label: "Balance"     },
  { value: "FLEXIBILITY", label: "Flexibility" },
] as const;

const DIFFICULTY_COLORS: Record<string, string> = {
  BEGINNER:     "bg-green-100 text-green-700 border-green-200",
  INTERMEDIATE: "bg-amber-100 text-amber-700 border-amber-200",
  ADVANCED:     "bg-red-100 text-red-700 border-red-200",
};

interface FilterBarProps {
  search: string;
  setSearch: (v: string) => void;
  phase: string;
  setPhase: (v: string) => void;
  bodyRegion: string;
  setRegion: (v: string) => void;
}

function FilterBar({ search, setSearch, phase, setPhase, bodyRegion, setRegion }: FilterBarProps) {
  return (
    <div className="px-4 pt-3 pb-2 space-y-2.5 shrink-0 border-b">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search exercises..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-8 text-sm"
        />
      </div>
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Category</p>
        <div className="flex flex-wrap gap-1">
          {PHASES.map((p) => (
            <button key={p.value} type="button" onClick={() => setPhase(p.value)}
              className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                phase === p.value ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
              )}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Body Region</p>
        <div className="flex flex-wrap gap-1">
          {REGIONS.map((r) => (
            <button key={r.value} type="button" onClick={() => setRegion(r.value)}
              className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                bodyRegion === r.value ? "bg-secondary text-secondary-foreground border-secondary" : "bg-background text-muted-foreground border-border hover:border-muted-foreground/50 hover:text-foreground"
              )}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ExerciseListProps {
  list: Exercise[];
  showClinicControls?: boolean;
  phase: string;
  setPhase: (v: string) => void;
  setRegion: (v: string) => void;
  onSelect: (ex: Exercise) => void;
  onClose: () => void;
  onPreview: (ex: Exercise) => void;
  onTogglePublic: (ex: Exercise, next: boolean) => void;
}

function ExerciseList({
  list,
  showClinicControls,
  phase,
  setPhase,
  setRegion,
  onSelect,
  onClose,
  onPreview,
  onTogglePublic,
}: ExerciseListProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-2">
      <p className="text-[11px] text-muted-foreground mb-1">{list.length} exercise{list.length !== 1 ? "s" : ""}</p>
      <div className="space-y-0.5">
        {list.map((ex) => (
          <button key={ex.id} type="button"
            className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-muted/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => { onSelect(ex); onClose(); }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-sm">{ex.name}</span>
                  {ex.videoUrl && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-sm font-medium shrink-0 hover:bg-blue-100 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); onPreview(ex); }}
                    >
                      <Play className="h-2.5 w-2.5" /> Video
                    </span>
                  )}
                  {showClinicControls && ex.source === "CLINIC" && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onTogglePublic(ex, !ex.isPublic); }}
                      className={cn(
                        "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-sm font-medium border transition-colors",
                        ex.isPublic
                          ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      {ex.isPublic ? <Globe className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                      {ex.isPublic ? "Public" : "Private"}
                    </button>
                  )}
                </div>
                {ex.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{ex.description}</p>
                )}
                <div className="flex flex-wrap gap-1 mt-1">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {ex.bodyRegion.replace(/_/g, " ")}
                  </Badge>
                  <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", DIFFICULTY_COLORS[ex.difficultyLevel])}>
                    {ex.difficultyLevel}
                  </Badge>
                  {ex.exercisePhase && ex.exercisePhase !== "STRENGTHENING" && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200">
                      {ex.exercisePhase.charAt(0) + ex.exercisePhase.slice(1).toLowerCase()}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}

        {list.length === 0 && (
          <div className="text-center py-10">
            <p className="text-sm text-muted-foreground">No exercises found.</p>
            {phase !== "all" && (
              <Button variant="ghost" size="sm" className="mt-2 text-xs"
                onClick={() => { setPhase("all"); setRegion("all"); }}>
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ExercisePickerDialog({
  open,
  onOpenChange,
  exercises,
  onSelect,
  clinicOrganizationId,
}: Props) {
  const [search, setSearch]     = useState("");
  const [phase, setPhase]       = useState<string>("all");
  const [bodyRegion, setRegion] = useState<string>("all");
  const [videoPreview, setVideoPreview] = useState<Exercise | null>(null);
  const [view, setView] = useState<"list" | "create">("list");
  const [localExercises, setLocalExercises] = useState<Exercise[]>([]);
  const [publicOverrides, setPublicOverrides] = useState<Map<string, boolean>>(new Map());
  const [isPending, startTransition] = useTransition();

  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    bodyRegion: "",
    difficultyLevel: "",
    exercisePhase: "",
    videoUrl: "",
    isPublic: true,
  });

  const allExercises = useMemo(
    () => [...exercises, ...localExercises].map((ex) =>
      publicOverrides.has(ex.id) ? { ...ex, isPublic: publicOverrides.get(ex.id) } : ex
    ),
    [exercises, localExercises, publicOverrides]
  );

  const universalExercises = useMemo(
    () => allExercises.filter(
      (ex) => ex.source === "UNIVERSAL" || (ex.source === "CLINIC" && ex.isPublic)
    ),
    [allExercises]
  );

  const myClinicExercises = useMemo(
    () => allExercises.filter(
      (ex) => ex.source === "CLINIC" && ex.organizationId === clinicOrganizationId
    ),
    [allExercises, clinicOrganizationId]
  );

  function applyFilters(list: Exercise[]) {
    const q = search.toLowerCase();
    return list.filter((ex) => {
      if (q && !ex.name.toLowerCase().includes(q)) return false;
      if (phase !== "all" && (ex.exercisePhase ?? "STRENGTHENING") !== phase) return false;
      if (bodyRegion !== "all" && ex.bodyRegion !== bodyRegion) return false;
      return true;
    });
  }

  const filteredUniversal = useMemo(() => applyFilters(universalExercises), [universalExercises, search, phase, bodyRegion]);
  const filteredMyClinic  = useMemo(() => applyFilters(myClinicExercises),  [myClinicExercises,  search, phase, bodyRegion]);

  function handleClose() {
    setView("list");
    setCreateForm({ name: "", description: "", bodyRegion: "", difficultyLevel: "", exercisePhase: "", videoUrl: "", isPublic: true });
    onOpenChange(false);
  }

  function handleTogglePublic(ex: Exercise, next: boolean) {
    startTransition(async () => {
      const result = await toggleExercisePublicAction(ex.id, next);
      if (result.success) {
        setPublicOverrides((prev) => new Map(prev).set(ex.id, next));
        setLocalExercises((prev) =>
          prev.map((e) => e.id === ex.id ? { ...e, isPublic: next } : e)
        );
        toast.success(next ? "Exercise is now public" : "Exercise is now private");
      } else {
        toast.error(result.error);
      }
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name || !createForm.bodyRegion || !createForm.difficultyLevel) {
      toast.error("Name, body region, and difficulty are required");
      return;
    }

    startTransition(async () => {
      const result = await createClinicExerciseAction({
        name: createForm.name,
        description: createForm.description || undefined,
        bodyRegion: createForm.bodyRegion,
        difficultyLevel: createForm.difficultyLevel,
        exercisePhase: createForm.exercisePhase || undefined,
        videoUrl: createForm.videoUrl || undefined,
        isPublic: createForm.isPublic,
      });

      if (result.success) {
        const newEx: Exercise = {
          id: result.data.id,
          name: result.data.name,
          bodyRegion: result.data.bodyRegion,
          difficultyLevel: result.data.difficultyLevel,
          exercisePhase: result.data.exercisePhase ?? null,
          videoUrl: result.data.videoUrl ?? null,
          videoProvider: result.data.videoProvider ?? null,
          description: result.data.description ?? null,
          source: "CLINIC",
          organizationId: result.data.organizationId ?? null,
          isPublic: result.data.isPublic,
        };
        setLocalExercises((prev) => [...prev, newEx]);
        toast.success("Exercise created and added");
        onSelect(newEx);
        handleClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-xl h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between">
              {view === "create" ? (
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Create New Exercise
                </button>
              ) : (
                <DialogTitle>Add Exercise</DialogTitle>
              )}
              {view === "list" && clinicOrganizationId && (
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setView("create")}>
                  <Plus className="h-3.5 w-3.5" />
                  Create New
                </Button>
              )}
            </div>
          </DialogHeader>

          {view === "create" ? (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ex-name" className="text-xs font-semibold">Name *</Label>
                  <Input
                    id="ex-name"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Seated Hip Flexor Stretch"
                    className="h-8 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Body Region *</Label>
                    <Select value={createForm.bodyRegion} onValueChange={(v) => setCreateForm((f) => ({ ...f, bodyRegion: v ?? f.bodyRegion }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOWER_BODY">Lower Body</SelectItem>
                        <SelectItem value="UPPER_BODY">Upper Body</SelectItem>
                        <SelectItem value="CORE">Core</SelectItem>
                        <SelectItem value="FULL_BODY">Full Body</SelectItem>
                        <SelectItem value="BALANCE">Balance</SelectItem>
                        <SelectItem value="FLEXIBILITY">Flexibility</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Difficulty *</Label>
                    <Select value={createForm.difficultyLevel} onValueChange={(v) => setCreateForm((f) => ({ ...f, difficultyLevel: v ?? f.difficultyLevel }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BEGINNER">Beginner</SelectItem>
                        <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
                        <SelectItem value="ADVANCED">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Phase</Label>
                  <Select value={createForm.exercisePhase} onValueChange={(v) => setCreateForm((f) => ({ ...f, exercisePhase: v ?? f.exercisePhase }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select phase..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WARMUP">Warm-up</SelectItem>
                      <SelectItem value="ACTIVATION">Activation</SelectItem>
                      <SelectItem value="STRENGTHENING">Strengthening</SelectItem>
                      <SelectItem value="MOBILITY">Mobility</SelectItem>
                      <SelectItem value="COOLDOWN">Cool-down</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ex-desc" className="text-xs font-semibold">Description</Label>
                  <Textarea
                    id="ex-desc"
                    value={createForm.description}
                    onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Brief description..."
                    className="text-sm resize-none h-16"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ex-video" className="text-xs font-semibold">Video URL</Label>
                  <Input
                    id="ex-video"
                    value={createForm.videoUrl}
                    onChange={(e) => setCreateForm((f) => ({ ...f, videoUrl: e.target.value }))}
                    placeholder="YouTube or Vimeo URL"
                    className="h-8 text-sm"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">Visible to all clinics</p>
                    <p className="text-xs text-muted-foreground">When on, this exercise appears in the Universal tab for all clinics</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={createForm.isPublic}
                    onClick={() => setCreateForm((f) => ({ ...f, isPublic: !f.isPublic }))}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      createForm.isPublic ? "bg-primary" : "bg-input"
                    )}
                  >
                    <span className={cn(
                      "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                      createForm.isPublic ? "translate-x-4" : "translate-x-0"
                    )} />
                  </button>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setView("list")}>Cancel</Button>
                  <Button type="submit" className="flex-1 h-8 text-xs" disabled={isPending}>
                    {isPending ? "Creating..." : "Create & Add to Program"}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <>
              <FilterBar
                search={search}
                setSearch={setSearch}
                phase={phase}
                setPhase={setPhase}
                bodyRegion={bodyRegion}
                setRegion={setRegion}
              />
              {clinicOrganizationId ? (
                <Tabs defaultValue="universal" className="flex flex-col flex-1 overflow-hidden">
                  <TabsList className="shrink-0 mx-4 mt-2 mb-1 h-8 text-xs">
                    <TabsTrigger value="universal" className="flex-1 text-xs h-6">Universal</TabsTrigger>
                    <TabsTrigger value="my-clinic" className="flex-1 text-xs h-6">My Clinic</TabsTrigger>
                  </TabsList>
                  <TabsContent value="universal" className="flex-1 overflow-hidden flex flex-col mt-0">
                    <ExerciseList
                      list={filteredUniversal}
                      phase={phase}
                      setPhase={setPhase}
                      setRegion={setRegion}
                      onSelect={onSelect}
                      onClose={handleClose}
                      onPreview={setVideoPreview}
                      onTogglePublic={handleTogglePublic}
                    />
                  </TabsContent>
                  <TabsContent value="my-clinic" className="flex-1 overflow-hidden flex flex-col mt-0">
                    <ExerciseList
                      list={filteredMyClinic}
                      showClinicControls
                      phase={phase}
                      setPhase={setPhase}
                      setRegion={setRegion}
                      onSelect={onSelect}
                      onClose={handleClose}
                      onPreview={setVideoPreview}
                      onTogglePublic={handleTogglePublic}
                    />
                  </TabsContent>
                </Tabs>
              ) : (
                <ExerciseList
                  list={filteredUniversal}
                  phase={phase}
                  setPhase={setPhase}
                  setRegion={setRegion}
                  onSelect={onSelect}
                  onClose={handleClose}
                  onPreview={setVideoPreview}
                  onTogglePublic={handleTogglePublic}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!videoPreview} onOpenChange={(o) => { if (!o) setVideoPreview(null); }}>
        <DialogContent className="sm:max-w-2xl gap-0 p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="font-semibold text-sm truncate pr-4">{videoPreview?.name}</p>
            <button onClick={() => setVideoPreview(null)} className="shrink-0 rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="w-full bg-black">
            {videoPreview?.videoUrl && (
              <UniversalVideoPlayer url={videoPreview.videoUrl} provider={videoPreview.videoProvider} autoPlay />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
