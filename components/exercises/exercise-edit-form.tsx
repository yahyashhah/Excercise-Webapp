"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BODY_REGIONS, DIFFICULTY_LEVELS, COMMON_EQUIPMENT } from "@/lib/utils/constants";
import { updateExerciseAction, addExerciseMediaAction, deleteExerciseMediaAction } from "@/actions/exercise-actions";
import { toast } from "sonner";
import { CheckCircle2, ImageIcon, Loader2, Play, Trash2, X } from "lucide-react";
import { UploadButton } from "@uploadthing/react";
import type { OurFileRouter } from "@/lib/uploadthing";
import { ExerciseVideoPlayer } from "@/components/exercises/exercise-video-player";

interface MediaItem {
  id: string;
  mediaType: string;
  url: string;
  thumbnailUrl: string | null;
  altText: string | null;
}

interface Exercise {
  id: string;
  name: string;
  description: string | null;
  bodyRegion: string;
  difficultyLevel: string;
  equipmentRequired: string[];
  contraindications: string[];
  instructions: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  isActive: boolean;
  media: MediaItem[];
}

interface Props {
  exercise: Exercise;
}

export function ExerciseEditForm({ exercise }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // All fields controlled — eliminates the uncontrolled warning
  const [name, setName] = useState(exercise.name);
  const [description, setDescription] = useState(exercise.description ?? "");
  const [bodyRegion, setBodyRegion] = useState(exercise.bodyRegion);
  const [difficultyLevel, setDifficultyLevel] = useState(exercise.difficultyLevel);
  const [isActive, setIsActive] = useState(String(exercise.isActive));
  const [instructions, setInstructions] = useState(exercise.instructions ?? "");
  const [contraindications, setContraindications] = useState(
    exercise.contraindications.join(", ")
  );
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>(
    exercise.equipmentRequired
  );
  const [videoUrl, setVideoUrl] = useState(exercise.videoUrl ?? "");
  const [imageUrl, setImageUrl] = useState(exercise.imageUrl ?? "");
  const [videoUploading, setVideoUploading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(exercise.media);
  const [mediaUploading, setMediaUploading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const result = await updateExerciseAction(exercise.id, {
      name: name.trim(),
      description: description.trim() || undefined,
      bodyRegion,
      difficultyLevel,
      equipmentRequired: selectedEquipment,
      contraindications: contraindications
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      instructions: instructions.trim() || undefined,
      videoUrl: videoUrl.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      isActive: isActive === "true",
    });

    setLoading(false);

    if (result.success) {
      toast.success("Exercise updated successfully");
      router.push(`/exercises/${exercise.id}`);
      router.refresh();
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
          <CardTitle>Edit: {exercise.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Name + Body Region */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Exercise Name *</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bodyRegion">Body Region *</Label>
              <select
                id="bodyRegion"
                required
                value={bodyRegion}
                onChange={(e) => setBodyRegion(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="">Select region</option>
                {BODY_REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief clinical description"
            />
          </div>

          {/* Difficulty + Status */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="difficultyLevel">Difficulty *</Label>
              <select
                id="difficultyLevel"
                required
                value={difficultyLevel}
                onChange={(e) => setDifficultyLevel(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="">Select difficulty</option>
                {DIFFICULTY_LEVELS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="isActive">Status</Label>
              <select
                id="isActive"
                value={isActive}
                onChange={(e) => setIsActive(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="true">Active — visible to AI</option>
                <option value="false">Inactive — hidden from AI</option>
              </select>
            </div>
          </div>

          {/* Equipment */}
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

          {/* Instructions */}
          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              rows={5}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Step-by-step instructions for the patient"
            />
          </div>

          {/* Contraindications */}
          <div className="space-y-2">
            <Label htmlFor="contraindications">Contraindications (comma separated)</Label>
            <Input
              id="contraindications"
              value={contraindications}
              onChange={(e) => setContraindications(e.target.value)}
              placeholder="e.g., Knee replacement, Acute back pain"
            />
          </div>

          {/* ── VIDEO ── */}
          <div className="space-y-4 rounded-lg border border-slate-200 p-4">
            <div>
              <h3 className="font-semibold text-slate-900">Video Demo</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Paste a YouTube link so clients can watch the exercise demo inline in their plan
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="videoUrl">YouTube URL</Label>
              <Input
                id="videoUrl"
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>

            {/* Live YouTube preview */}
            {videoUrl && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-500">Live Preview</p>
                <ExerciseVideoPlayer
                  videoUrl={videoUrl}
                  mediaItems={[]}
                  className="w-full max-w-md"
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">or upload a video file</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {/* Uploaded video indicator */}
            {videoUrl && !videoUrl.includes("youtube") && !videoUrl.includes("youtu.be") && (
              <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-xs text-green-700 truncate flex-1">{videoUrl}</span>
                <button type="button" onClick={() => setVideoUrl("")}>
                  <X className="h-3.5 w-3.5 text-green-600" />
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
                  toast.success("Video uploaded successfully");
                }
              }}
              onUploadError={(error: Error) => {
                setVideoUploading(false);
                toast.error(`Upload failed: ${error.message}`);
              }}
            />
            {videoUploading && (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Uploading video…
              </p>
            )}
          </div>

          {/* ── IMAGE ── */}
          <div className="space-y-4 rounded-lg border border-slate-200 p-4">
            <div>
              <h3 className="font-semibold text-slate-900">Exercise Image</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Shown as a thumbnail on exercise cards and in the PDF handout
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/exercise-photo.jpg"
              />
              <p className="text-xs text-slate-500">Paste any image URL from the web</p>
            </div>

            {/* Image preview using regular img (no Next.js hostname restrictions for preview) */}
            {imageUrl && (
              <div className="relative">
                <div className="relative h-40 w-full overflow-hidden rounded-lg bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="Exercise preview"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="absolute right-2 top-2 rounded-full bg-white p-1 shadow-md"
                >
                  <X className="h-3.5 w-3.5 text-slate-600" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">or upload directly</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <UploadButton<OurFileRouter, "exerciseImage">
              endpoint="exerciseImage"
              onUploadBegin={() => setImageUploading(true)}
              onClientUploadComplete={(res) => {
                setImageUploading(false);
                const url = res?.[0]?.ufsUrl;
                if (url) {
                  setImageUrl(url);
                  toast.success("Image uploaded successfully");
                }
              }}
              onUploadError={(error: Error) => {
                setImageUploading(false);
                toast.error(`Upload failed: ${error.message}`);
              }}
            />
            {imageUploading && (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Uploading image…
              </p>
            )}
          </div>

          {/* ── ADDITIONAL MEDIA GALLERY ── */}
          <div className="space-y-4 rounded-lg border border-slate-200 p-4">
            <div>
              <h3 className="font-semibold text-slate-900">Additional Media</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Add multiple photos and videos — shown in a gallery on the exercise detail page
              </p>
            </div>

            {/* Existing media items */}
            {mediaItems.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {mediaItems.map((item) => (
                  <div key={item.id} className="group relative rounded-lg overflow-hidden bg-slate-100">
                    {item.mediaType === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt={item.altText ?? "Exercise photo"}
                        className="h-28 w-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="flex h-28 items-center justify-center bg-slate-800">
                        <Play className="h-8 w-8 text-white" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-2 py-1">
                      <span className="text-xs text-white capitalize">{item.mediaType}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          const result = await deleteExerciseMediaAction(exercise.id, item.id);
                          if (result.success) {
                            setMediaItems((prev) => prev.filter((m) => m.id !== item.id));
                            toast.success("Media removed");
                          } else {
                            toast.error(result.error);
                          }
                        }}
                        className="rounded p-0.5 text-white hover:bg-red-500/80"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload new image */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" /> Add Photo
              </p>
              <UploadButton<OurFileRouter, "exerciseImage">
                endpoint="exerciseImage"
                onUploadBegin={() => setMediaUploading(true)}
                onClientUploadComplete={async (res) => {
                  setMediaUploading(false);
                  const url = res?.[0]?.ufsUrl;
                  if (url) {
                    const result = await addExerciseMediaAction(exercise.id, { mediaType: "image", url });
                    if (result.success && result.data) {
                      setMediaItems((prev) => [...prev, result.data as MediaItem]);
                      toast.success("Photo added to gallery");
                    }
                  }
                }}
                onUploadError={(error: Error) => {
                  setMediaUploading(false);
                  toast.error(`Upload failed: ${error.message}`);
                }}
                appearance={{ button: "ut-ready:bg-slate-700 ut-uploading:bg-slate-400" }}
              />
            </div>

            {/* Upload new video */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5" /> Add Video File
              </p>
              <UploadButton<OurFileRouter, "exerciseVideo">
                endpoint="exerciseVideo"
                onUploadBegin={() => setMediaUploading(true)}
                onClientUploadComplete={async (res) => {
                  setMediaUploading(false);
                  const url = res?.[0]?.ufsUrl;
                  if (url) {
                    const result = await addExerciseMediaAction(exercise.id, { mediaType: "video", url });
                    if (result.success && result.data) {
                      setMediaItems((prev) => [...prev, result.data as MediaItem]);
                      toast.success("Video added to gallery");
                    }
                  }
                }}
                onUploadError={(error: Error) => {
                  setMediaUploading(false);
                  toast.error(`Upload failed: ${error.message}`);
                }}
                appearance={{ button: "ut-ready:bg-slate-700 ut-uploading:bg-slate-400" }}
              />
            </div>

            {mediaUploading && (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || videoUploading || imageUploading || mediaUploading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>

        </CardContent>
      </Card>
    </form>
  );
}
