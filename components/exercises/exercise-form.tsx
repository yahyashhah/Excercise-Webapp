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
import { CheckCircle2, Loader2, Upload, X } from "lucide-react";
import { UploadButton } from "@uploadthing/react";
import type { OurFileRouter } from "@/lib/uploadthing";

export function ExerciseForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUploading, setVideoUploading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const result = await createExerciseAction({
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || undefined,
      bodyRegion: formData.get("bodyRegion") as string,
      difficultyLevel: formData.get("difficultyLevel") as string,
      equipmentRequired: selectedEquipment,
      contraindications:
        (formData.get("contraindications") as string)
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) || [],
      instructions: (formData.get("instructions") as string) || undefined,
      videoUrl: videoUrl || undefined,
      imageUrl: imageUrl || undefined,
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
            <Textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Brief clinical description of the exercise"
            />
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
            <Textarea
              id="instructions"
              name="instructions"
              rows={4}
              placeholder="Step-by-step instructions for the patient"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contraindications">Contraindications (comma separated)</Label>
            <Input
              id="contraindications"
              name="contraindications"
              placeholder="e.g., Knee replacement, Acute back pain"
            />
          </div>

          {/* ── Video ── */}
          <div className="space-y-3 rounded-lg border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">Video Demo</h3>

            <div className="space-y-2">
              <Label htmlFor="videoUrl">YouTube / Video URL</Label>
              <Input
                id="videoUrl"
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <p className="text-xs text-slate-500">
                Paste a YouTube URL to embed a video demo for your clients
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">or upload directly</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="space-y-2">
              {videoUrl && videoUrl.startsWith("blob") === false && (
                <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{videoUrl}</span>
                  <button
                    type="button"
                    onClick={() => setVideoUrl("")}
                    className="ml-auto flex-shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <UploadButton<OurFileRouter, "exerciseVideo">
                endpoint="exerciseVideo"
                onUploadBegin={() => setVideoUploading(true)}
                onClientUploadComplete={(res) => {
                  setVideoUploading(false);
                  const url = res?.[0]?.ufsUrl;
                  if (url) {
                    setVideoUrl(url);
                    toast.success("Video uploaded — URL saved");
                  }
                }}
                onUploadError={(error: Error) => {
                  setVideoUploading(false);
                  toast.error(`Upload failed: ${error.message}`);
                }}
                appearance={{
                  button: "ut-ready:bg-slate-900 ut-uploading:bg-slate-400",
                }}
              />
              {videoUploading && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Uploading video…
                </p>
              )}
            </div>
          </div>

          {/* ── Image ── */}
          <div className="space-y-3 rounded-lg border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">Exercise Image</h3>

            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/exercise-photo.jpg"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">or upload directly</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {imageUrl && (
              <div className="relative">
                <div className="relative h-32 w-full overflow-hidden rounded-lg bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="Exercise preview"
                    className="h-full w-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="absolute right-2 top-2 rounded-full bg-white p-1 shadow"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <div className="space-y-2">
              <UploadButton<OurFileRouter, "exerciseImage">
                endpoint="exerciseImage"
                onUploadBegin={() => setImageUploading(true)}
                onClientUploadComplete={(res) => {
                  setImageUploading(false);
                  const url = res?.[0]?.ufsUrl;
                  if (url) {
                    setImageUrl(url);
                    toast.success("Image uploaded — preview shown above");
                  }
                }}
                onUploadError={(error: Error) => {
                  setImageUploading(false);
                  toast.error(`Upload failed: ${error.message}`);
                }}
                appearance={{
                  button: "ut-ready:bg-slate-900 ut-uploading:bg-slate-400",
                }}
              />
              {imageUploading && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Uploading image…
                </p>
              )}
              <p className="text-xs text-slate-500">
                <Upload className="inline h-3 w-3 mr-1" />
                Upload a photo of the exercise (max 4MB)
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || videoUploading || imageUploading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Exercise
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
