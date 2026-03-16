"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BODY_REGIONS, DIFFICULTY_LEVELS, COMMON_EQUIPMENT } from "@/lib/utils/constants";
import { createExerciseAction } from "@/actions/exercise-actions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function ExerciseForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const result = await createExerciseAction({
      name: formData.get("name") as string,
      description: formData.get("description") as string || undefined,
      bodyRegion: formData.get("bodyRegion") as string,
      difficultyLevel: formData.get("difficultyLevel") as string,
      equipmentRequired: selectedEquipment,
      contraindications: (formData.get("contraindications") as string)
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) || [],
      instructions: formData.get("instructions") as string || undefined,
      videoUrl: formData.get("videoUrl") as string || undefined,
      imageUrl: formData.get("imageUrl") as string || undefined,
    });

    setLoading(false);

    if (result.success) {
      toast.success("Exercise created successfully");
      router.push("/exercises");
    } else {
      toast.error(result.error);
    }
  }

  function toggleEquipment(item: string) {
    setSelectedEquipment((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item]
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Create New Exercise</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Exercise Name *</Label>
              <Input id="name" name="name" required placeholder="e.g., Wall Squat" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bodyRegion">Body Region *</Label>
              <select
                id="bodyRegion"
                name="bodyRegion"
                required
                className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
              >
                <option value="">Select region</option>
                {BODY_REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={3} placeholder="Brief description of the exercise" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="difficultyLevel">Difficulty *</Label>
            <select
              id="difficultyLevel"
              name="difficultyLevel"
              required
              className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
            >
              <option value="">Select difficulty</option>
              {DIFFICULTY_LEVELS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Equipment Required</Label>
            <div className="flex flex-wrap gap-2">
              {COMMON_EQUIPMENT.map((eq) => (
                <Button
                  key={eq}
                  type="button"
                  variant={selectedEquipment.includes(eq) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleEquipment(eq)}
                >
                  {eq}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea id="instructions" name="instructions" rows={4} placeholder="Step-by-step instructions" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contraindications">Contraindications (comma separated)</Label>
            <Input id="contraindications" name="contraindications" placeholder="e.g., Knee replacement, Acute back pain" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="videoUrl">Video URL</Label>
              <Input id="videoUrl" name="videoUrl" type="url" placeholder="https://" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input id="imageUrl" name="imageUrl" type="url" placeholder="https://" />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Exercise
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
