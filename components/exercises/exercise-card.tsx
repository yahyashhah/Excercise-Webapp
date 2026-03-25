import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, Video } from "lucide-react";
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

const difficultyColors: Record<string, string> = {
  BEGINNER: "bg-green-100 text-green-700",
  INTERMEDIATE: "bg-amber-100 text-amber-700",
  ADVANCED: "bg-red-100 text-red-700",
};

const phaseColors: Record<string, string> = {
  WARMUP: "bg-orange-100 text-orange-700",
  ACTIVATION: "bg-yellow-100 text-yellow-700",
  STRENGTHENING: "bg-blue-100 text-blue-700",
  MOBILITY: "bg-purple-100 text-purple-700",
  COOLDOWN: "bg-teal-100 text-teal-700",
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
  return (
    <Card className={`h-full overflow-hidden transition-shadow hover:shadow-md ${isActive === false ? "opacity-60" : ""}`}>
      {/* Thumbnail */}
      <Link href={`/exercises/${id}`}>
        <div className="relative h-40 w-full bg-slate-100 flex items-center justify-center">
          <ExerciseImage
            src={imageUrl}
            alt={name}
            bodyRegion={bodyRegion}
            videoUrl={videoUrl}
            label={name.split(" ").slice(0, 3).join(" ")}
          />
          {/* Phase badge overlaid on image */}
          {exercisePhase && (
            <span className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium ${phaseColors[exercisePhase] ?? "bg-slate-100 text-slate-700"}`}>
              {exercisePhase.charAt(0) + exercisePhase.slice(1).toLowerCase()}
            </span>
          )}
          {/* Video indicator */}
          {videoUrl && (
            <span className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white">
              <Video className="h-3 w-3" />
            </span>
          )}
          {/* Inactive indicator */}
          {isActive === false && (
            <span className="absolute left-2 top-2 rounded-full bg-slate-700/80 px-2 py-0.5 text-xs text-white">
              Inactive
            </span>
          )}
        </div>
      </Link>

      <CardContent className="p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <Link href={`/exercises/${id}`} className="flex-1">
            <h3 className="font-semibold text-slate-900 leading-tight hover:text-blue-600 transition-colors">
              {name}
            </h3>
          </Link>
          <Badge className={`${difficultyColors[difficultyLevel] ?? ""} shrink-0 text-xs`} variant="secondary">
            {formatDifficulty(difficultyLevel)}
          </Badge>
        </div>

        <p className="mb-2 text-xs text-slate-500">{formatBodyRegion(bodyRegion)}</p>

        {description && (
          <p className="mb-3 line-clamp-2 text-sm text-slate-600">{description}</p>
        )}

        {equipmentRequired.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {equipmentRequired.map((eq) => (
              <Badge key={eq} variant="outline" className="text-xs">
                {eq}
              </Badge>
            ))}
          </div>
        )}

        {isClinician && (
          <Button variant="outline" size="sm" className="w-full mt-1" asChild>
            <Link href={`/exercises/${id}/edit`}>
              <Edit className="mr-1.5 h-3.5 w-3.5" />
              Edit / Add Video
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
