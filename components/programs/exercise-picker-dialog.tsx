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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: {
    id: string;
    name: string;
    bodyRegion: string;
    difficultyLevel: string;
    defaultReps?: number | null;
    musclesTargeted?: string[];
    imageUrl?: string | null;
  }[];
  onSelect: (exercise: Props["exercises"][number]) => void;
}

export function ExercisePickerDialog({
  open,
  onOpenChange,
  exercises,
  onSelect,
}: Props) {
  const [search, setSearch] = useState("");
  const [bodyRegion, setBodyRegion] = useState<string>("all");

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      if (search && !ex.name.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (bodyRegion !== "all" && ex.bodyRegion !== bodyRegion) return false;
      return true;
    });
  }, [exercises, search, bodyRegion]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Select Exercise</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search exercises..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={bodyRegion} onValueChange={(v) => setBodyRegion(v ?? "all")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Body region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              <SelectItem value="UPPER_BODY">Upper Body</SelectItem>
              <SelectItem value="LOWER_BODY">Lower Body</SelectItem>
              <SelectItem value="CORE">Core</SelectItem>
              <SelectItem value="FULL_BODY">Full Body</SelectItem>
              <SelectItem value="BALANCE">Balance</SelectItem>
              <SelectItem value="FLEXIBILITY">Flexibility</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ScrollArea className="h-[400px]">
          <div className="space-y-1">
            {filtered.map((ex) => (
              <Button
                key={ex.id}
                variant="ghost"
                className="w-full justify-start h-auto py-3"
                onClick={() => onSelect(ex)}
              >
                <div className="text-left">
                  <p className="font-medium">{ex.name}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {ex.bodyRegion.replace("_", " ")}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {ex.difficultyLevel}
                    </Badge>
                  </div>
                </div>
              </Button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                No exercises found.
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
