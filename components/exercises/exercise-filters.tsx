"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BODY_REGIONS, DIFFICULTY_LEVELS } from "@/lib/utils/constants";
import { X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const EXERCISE_PHASES = [
  { value: "",             label: "All Categories"  },
  { value: "WARMUP",       label: "Warm-up"         },
  { value: "ACTIVATION",   label: "Activation"      },
  { value: "STRENGTHENING",label: "Strengthening"   },
  { value: "MOBILITY",     label: "Mobility"        },
  { value: "COOLDOWN",     label: "Cool-down"       },
] as const;

export function ExerciseFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSearch     = searchParams.get("search") || "";
  const currentRegion     = searchParams.get("bodyRegion") || "";
  const currentDifficulty = searchParams.get("difficultyLevel") || "";
  const currentPhase      = searchParams.get("exercisePhase") || "";

  const [searchValue, setSearchValue] = useState(currentSearch);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      const nextQuery = params.toString();
      router.push(nextQuery ? `/exercises?${nextQuery}` : "/exercises");
    },
    [router, searchParams]
  );

  useEffect(() => {
    setSearchValue(currentSearch);
  }, [currentSearch]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchValue !== currentSearch) {
        updateParam("search", searchValue);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchValue, currentSearch, updateParam]);

  const hasFilters = currentSearch || currentRegion || currentDifficulty || currentPhase;

  return (
    <div className="space-y-3">
      {/* Search + dropdowns row */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search exercises..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9"
          />
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Body Region</p>
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={currentRegion}
            onChange={(e) => updateParam("bodyRegion", e.target.value)}
          >
            <option value="">All Regions</option>
            {BODY_REGIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Difficulty</p>
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={currentDifficulty}
            onChange={(e) => updateParam("difficultyLevel", e.target.value)}
          >
            <option value="">All Levels</option>
            {DIFFICULTY_LEVELS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => router.push("/exercises")}>
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Category pill row */}
      <div className="flex flex-wrap gap-1.5">
        {EXERCISE_PHASES.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => updateParam("exercisePhase", p.value)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              currentPhase === p.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
