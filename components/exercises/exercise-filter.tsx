"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

export function ExerciseFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set("page", "1");
      router.push(`/exercises?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      <div className="relative flex-1">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search exercises..."
          defaultValue={searchParams.get("search") ?? ""}
          className="pl-9"
          onChange={(e) => {
            const timer = setTimeout(() => updateParams("search", e.target.value), 300);
            return () => clearTimeout(timer);
          }}
        />
      </div>

      <Select
        defaultValue={searchParams.get("bodyRegion") || "all"}
        onValueChange={(value) => updateParams("bodyRegion", value ?? "all")}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Body Region" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Regions</SelectItem>
          <SelectItem value="lower_body">Lower Body</SelectItem>
          <SelectItem value="upper_body">Upper Body</SelectItem>
          <SelectItem value="core">Core</SelectItem>
          <SelectItem value="full_body">Full Body</SelectItem>
          <SelectItem value="balance">Balance</SelectItem>
          <SelectItem value="flexibility">Flexibility</SelectItem>
        </SelectContent>
      </Select>

      <Select
        defaultValue={searchParams.get("difficultyLevel") || "all"}
        onValueChange={(value) => updateParams("difficultyLevel", value ?? "all")}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Difficulty" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Levels</SelectItem>
          <SelectItem value="beginner">Beginner</SelectItem>
          <SelectItem value="intermediate">Intermediate</SelectItem>
          <SelectItem value="advanced">Advanced</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
