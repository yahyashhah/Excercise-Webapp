import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, Video, ChevronRight } from "lucide-react";
import { ExerciseImage } from "@/components/exercises/exercise-image";
import { formatBodyRegion, formatDifficulty } from "@/lib/utils/formatting";

interface ExerciseCardProps {
  id: string;
  name: string;
  bodyRegion: string;
  difficultyLevel: string;
  exercisePhase?: string | null;
  equipmentRequired: string[];
  description?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  isActive?: boolean;
  isClinician?: boolean;
}

const difficultyConfig: Record<string, { label: string; className: string }> = {
  BEGINNER: { label: "Beginner", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  INTERMEDIATE: { label: "Intermediate", className: "bg-amber-50 text-amber-700 border-amber-200" },
  ADVANCED: { label: "Advanced", className: "bg-red-50 text-red-700 border-red-200" },
};

const phaseConfig: Record<string, { className: string }> = {
  WARMUP: { className: "bg-orange-100 text-orange-700" },
  ACTIVATION: { className: "bg-yellow-100 text-yellow-700" },
  STRENGTHENING: { className: "bg-blue-100 text-blue-700" },
  MOBILITY: { className: "bg-purple-100 text-purple-700" },
  COOLDOWN: { className: "bg-teal-100 text-teal-700" },
};

export function ExerciseCard({
  id,
  name,
  bodyRegion,
  difficultyLevel,
  exercisePhase,
  equipmentRequired,
  description,
  imageUrl,
  videoUrl,
  isActive,
  isClinician,
}: ExerciseCardProps) {
  const difficulty = difficultyConfig[difficultyLevel];
  const phase = exercisePhase ? phaseConfig[exercisePhase] : null;

  return (
    <Card className={`group h-full overflow-hidden border-border/60 transition-all duration-200 hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5 ${isActive === false ? "opacity-55" : ""}`}>
      {/* Thumbnail */}
      <Link href={`/exercises/${id}`} className="block">
        <div className="relative h-44 w-full overflow-hidden bg-slate-100">
          <ExerciseImage
            src={imageUrl}
            alt={name}
            bodyRegion={bodyRegion}
            videoUrl={videoUrl}
            label={name.split(" ").slice(0, 3).join(" ")}
          />
          {/* Overlay badges */}
          <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {exercisePhase && phase && (
            <span className={`absolute bottom-2 left-2 rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm ${phase.className}`}>
              {exercisePhase.charAt(0) + exercisePhase.slice(1).toLowerCase()}
            </span>
          )}
          {videoUrl && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-white shadow">
              <Video className="h-3 w-3" />
              <span className="text-[10px] font-medium">Video</span>
            </span>
          )}
          {isActive === false && (
            <span className="absolute left-2 top-2 rounded-full bg-slate-800/80 px-2.5 py-0.5 text-xs font-medium text-white">
              Inactive
            </span>
          )}
        </div>
      </Link>

      <CardContent className="p-4">
        {/* Title row */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <Link href={`/exercises/${id}`} className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
              {name}
            </h3>
          </Link>
        </div>

        {/* Meta row */}
        <div className="mb-3 flex items-center gap-2">
          <p className="text-xs text-muted-foreground">{formatBodyRegion(bodyRegion)}</p>
          {difficulty && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${difficulty.className}`}>
                {formatDifficulty(difficultyLevel)}
              </span>
            </>
          )}
        </div>

        {description && (
          <p className="mb-3 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}

        {equipmentRequired.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {equipmentRequired.slice(0, 3).map((eq) => (
              <Badge key={eq} variant="outline" className="text-[10px] px-2 py-0 border-border/50">
                {eq}
              </Badge>
            ))}
            {equipmentRequired.length > 3 && (
              <Badge variant="outline" className="text-[10px] px-2 py-0 border-border/50 text-muted-foreground">
                +{equipmentRequired.length - 3}
              </Badge>
            )}
          </div>
        )}

        {isClinician ? (
          <Button variant="outline" size="sm" className="w-full h-8 text-xs mt-1 border-border/60 hover:border-primary/30 hover:bg-primary/5" asChild>
            <Link href={`/exercises/${id}/edit`}>
              <Edit className="mr-1.5 h-3 w-3" />
              Edit / Add Video
            </Link>
          </Button>
        ) : (
          <Link
            href={`/exercises/${id}`}
            className="flex items-center justify-center gap-1 text-xs text-primary font-medium mt-1 hover:underline"
          >
            View details <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
