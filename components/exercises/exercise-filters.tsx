"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BODY_REGIONS, DIFFICULTY_LEVELS } from "@/lib/utils/constants";
import { Search, SlidersHorizontal, X } from "lucide-react";

export function ExerciseFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get("search") || "";
  const currentRegion = searchParams.get("bodyRegion") || "";
  const currentDifficulty = searchParams.get("difficultyLevel") || "";
  const [searchValue, setSearchValue] = useState(currentSearch);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") {
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

  function clearFilters() {
    setSearchValue("");
    router.push("/exercises");
  }

  const hasFilters = currentSearch || currentRegion || currentDifficulty;
  const activeFilterCount = [currentSearch, currentRegion, currentDifficulty].filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-56 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search exercises..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Divider on larger screens */}
      <div className="hidden h-5 w-px bg-border sm:block" />

      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline font-medium">Filter:</span>
        </div>

        {/* Body Region */}
        <Select
          value={currentRegion || "all"}
          onValueChange={(v) => updateParam("bodyRegion", v)}
        >
          <SelectTrigger className="h-9 w-40 text-sm">
            <SelectValue placeholder="Body Region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Regions</SelectItem>
            {BODY_REGIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Difficulty */}
        <Select
          value={currentDifficulty || "all"}
          onValueChange={(v) => updateParam("difficultyLevel", v)}
        >
          <SelectTrigger className="h-9 w-36 text-sm">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {DIFFICULTY_LEVELS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
