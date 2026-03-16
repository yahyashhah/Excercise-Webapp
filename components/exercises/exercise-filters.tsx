"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BODY_REGIONS, DIFFICULTY_LEVELS } from "@/lib/utils/constants";
import { X } from "lucide-react";

export function ExerciseFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get("search") || "";
  const currentRegion = searchParams.get("bodyRegion") || "";
  const currentDifficulty = searchParams.get("difficultyLevel") || "";

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/exercises?${params.toString()}`);
  }

  function clearFilters() {
    router.push("/exercises");
  }

  const hasFilters = currentSearch || currentRegion || currentDifficulty;

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="w-64">
        <Label htmlFor="search" className="text-sm text-slate-600">
          Search
        </Label>
        <Input
          id="search"
          placeholder="Search exercises..."
          defaultValue={currentSearch}
          onChange={(e) => {
            const timeout = setTimeout(() => {
              updateParam("search", e.target.value);
            }, 300);
            return () => clearTimeout(timeout);
          }}
        />
      </div>

      <div>
        <Label className="text-sm text-slate-600">Body Region</Label>
        <select
          className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={currentRegion}
          onChange={(e) => updateParam("bodyRegion", e.target.value)}
        >
          <option value="">All Regions</option>
          {BODY_REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label className="text-sm text-slate-600">Difficulty</Label>
        <select
          className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={currentDifficulty}
          onChange={(e) => updateParam("difficultyLevel", e.target.value)}
        >
          <option value="">All Levels</option>
          {DIFFICULTY_LEVELS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="mr-1 h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
