"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Play } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: Exercise[];
  onSelect: (exercise: Exercise) => void;
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

export function ExercisePickerDialog({
  open,
  onOpenChange,
  exercises,
  onSelect,
}: Props) {
  const [search, setSearch]     = useState("");
  const [phase, setPhase]       = useState<string>("all");
  const [bodyRegion, setRegion] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return exercises.filter((ex) => {
      if (q && !ex.name.toLowerCase().includes(q)) return false;
      if (phase !== "all" && (ex.exercisePhase ?? "STRENGTHENING") !== phase) return false;
      if (bodyRegion !== "all" && ex.bodyRegion !== bodyRegion) return false;
      return true;
    });
  }, [exercises, search, phase, bodyRegion]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Fixed header */}
        <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <DialogTitle>Add Exercise</DialogTitle>
        </DialogHeader>

        {/* Fixed filters */}
        <div className="px-4 pt-3 pb-2 space-y-2.5 shrink-0 border-b">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search exercises..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>

          {/* Phase pills */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Category</p>
            <div className="flex flex-wrap gap-1">
              {PHASES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPhase(p.value)}
                  className={cn(
                    "px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                    phase === p.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Region pills */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Body Region</p>
            <div className="flex flex-wrap gap-1">
              {REGIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRegion(r.value)}
                  className={cn(
                    "px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                    bodyRegion === r.value
                      ? "bg-secondary text-secondary-foreground border-secondary"
                      : "bg-background text-muted-foreground border-border hover:border-muted-foreground/50 hover:text-foreground"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {filtered.length} exercise{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Scrollable exercise list */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          <div className="space-y-0.5">
            {filtered.map((ex) => (
              <button
                key={ex.id}
                type="button"
                className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-muted/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onSelect(ex)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm">{ex.name}</span>
                      {ex.videoUrl && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-sm font-medium shrink-0">
                          <Play className="h-2.5 w-2.5" /> Video
                        </span>
                      )}
                    </div>
                    {ex.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {ex.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {ex.bodyRegion.replace(/_/g, " ")}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] px-1.5 py-0", DIFFICULTY_COLORS[ex.difficultyLevel])}
                      >
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

            {filtered.length === 0 && (
              <div className="text-center py-10">
                <p className="text-sm text-muted-foreground">No exercises found.</p>
                {(phase !== "all" || bodyRegion !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs"
                    onClick={() => { setPhase("all"); setRegion("all"); }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
