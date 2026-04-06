"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { ExerciseSetInput } from "@/lib/validators/program";

interface Props {
  sets: ExerciseSetInput[];
  onChange: (sets: ExerciseSetInput[]) => void;
}

export function SetEditor({ sets, onChange }: Props) {
  function addSet() {
    const last = sets[sets.length - 1];
    onChange([
      ...sets,
      {
        orderIndex: sets.length,
        setType: last?.setType || "NORMAL",
        targetReps: last?.targetReps || 10,
        targetWeight: last?.targetWeight || null,
        targetDuration: last?.targetDuration || null,
        targetDistance: last?.targetDistance || null,
        targetRPE: last?.targetRPE || null,
        restAfter: last?.restAfter || null,
      },
    ]);
  }

  function removeSet(idx: number) {
    if (sets.length <= 1) return;
    onChange(
      sets.filter((_, i) => i !== idx).map((s, i) => ({ ...s, orderIndex: i }))
    );
  }

  function updateSet(idx: number, field: string, value: number | string | null) {
    const next = [...sets];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  }

  return (
    <div className="space-y-1.5">
      {/* Header row */}
      <div className="grid grid-cols-[100px_minmax(70px,1fr)_minmax(70px,1fr)_minmax(70px,1fr)_minmax(60px,1fr)_40px] gap-2 text-xs text-muted-foreground font-medium px-1">
        <span>Type</span>
        <span>Reps</span>
        <span>Weight</span>
        <span>Duration</span>
        <span>RPE</span>
        <span></span>
      </div>
      {sets.map((set, si) => (
        <div
          key={si}
          className="grid grid-cols-[100px_minmax(70px,1fr)_minmax(70px,1fr)_minmax(70px,1fr)_minmax(60px,1fr)_40px] gap-2 items-center"
        >
          <Select
            value={set.setType}
            onValueChange={(v) => updateSet(si, "setType", v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NORMAL">Normal</SelectItem>
              <SelectItem value="WARMUP">Warmup</SelectItem>
              <SelectItem value="DROP_SET">Drop</SelectItem>
              <SelectItem value="FAILURE">Failure</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={set.targetReps ?? ""}
            onChange={(e) =>
              updateSet(
                si,
                "targetReps",
                e.target.value ? parseInt(e.target.value) : null
              )
            }
            className="h-8 text-xs"
            placeholder="Reps"
            min={0}
          />
          <Input
            type="number"
            value={set.targetWeight ?? ""}
            onChange={(e) =>
              updateSet(
                si,
                "targetWeight",
                e.target.value ? parseFloat(e.target.value) : null
              )
            }
            className="h-8 text-xs"
            placeholder="lbs"
            min={0}
            step={2.5}
          />
          <Input
            type="number"
            value={set.targetDuration ?? ""}
            onChange={(e) =>
              updateSet(
                si,
                "targetDuration",
                e.target.value ? parseInt(e.target.value) : null
              )
            }
            className="h-8 text-xs"
            placeholder="sec"
            min={0}
          />
          <Input
            type="number"
            value={set.targetRPE ?? ""}
            onChange={(e) =>
              updateSet(
                si,
                "targetRPE",
                e.target.value ? parseInt(e.target.value) : null
              )
            }
            className="h-8 text-xs"
            placeholder="RPE"
            min={1}
            max={10}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => removeSet(si)}
            disabled={sets.length <= 1}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={addSet} className="text-xs h-7">
        <Plus className="mr-1 h-3 w-3" /> Add Set
      </Button>
    </div>
  );
}
