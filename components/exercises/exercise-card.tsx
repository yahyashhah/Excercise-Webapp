import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, PlayCircle, ArrowRight } from "lucide-react";
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
  BEGINNER: { label: "Beginner", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  INTERMEDIATE: { label: "Intermediate", className: "bg-amber-100 text-amber-700 border-amber-200" },
  ADVANCED: { label: "Advanced", className: "bg-red-100 text-red-700 border-red-200" },
};

const phaseConfig: Record<string, { label: string; className: string }> = {
  WARMUP: { label: "Warmup", className: "bg-orange-900/70 text-orange-200" },
  ACTIVATION: { label: "Activation", className: "bg-yellow-900/70 text-yellow-200" },
  STRENGTHENING: { label: "Strengthening", className: "bg-blue-900/70 text-blue-200" },
  MOBILITY: { label: "Mobility", className: "bg-purple-900/70 text-purple-200" },
  COOLDOWN: { label: "Cooldown", className: "bg-teal-900/70 text-teal-200" },
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
  const difficulty = difficultyConfig[difficultyLevel] ?? { label: formatDifficulty(difficultyLevel), className: "bg-muted text-muted-foreground border-border" };
  const phase = exercisePhase ? (phaseConfig[exercisePhase] ?? { label: exercisePhase, className: "bg-black/60 text-white" }) : null;

  return (
    <Card
      className={`group relative flex flex-col overflow-hidden border-0 shadow-sm ring-1 ring-border/50 transition-all duration-250 hover:-translate-y-1 hover:shadow-xl hover:ring-border/80 ${isActive === false ? "opacity-60" : ""}`}
    >
      {/* Thumbnail */}
      <Link href={`/exercises/${id}`} className="relative block h-44 overflow-hidden bg-muted">
        <ExerciseImage
          src={null}
          alt={name}
          bodyRegion={bodyRegion}
          videoUrl={videoUrl}
          label={name.split(" ").slice(0, 3).join(" ")}
        />

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-1.5 text-sm font-semibold text-slate-800 shadow-lg backdrop-blur-sm">
            <ArrowRight className="h-3.5 w-3.5" />
            View Exercise
          </div>
        </div>

        {/* Overlaid badges */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-2.5">
          {phase && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${phase.className}`}>
              {phase.label}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {videoUrl && (
              <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                <PlayCircle className="h-3 w-3" />
                Video
              </span>
            )}
            {isActive === false && (
              <span className="rounded-full bg-slate-700/80 px-2 py-0.5 text-[10px] font-medium text-white">
                Inactive
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Content */}
      <CardContent className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/exercises/${id}`} className="flex-1 min-w-0">
            <h3 className="truncate text-sm font-semibold leading-tight transition-colors group-hover:text-primary">
              {name}
            </h3>
          </Link>
          <Badge
            className={`shrink-0 border text-[10px] font-semibold ${difficulty.className}`}
          >
            {difficulty.label}
          </Badge>
        </div>

        <p className="mt-1 text-xs font-medium text-muted-foreground/70">
          {formatBodyRegion(bodyRegion)}
        </p>

        {description && (
          <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}

        {equipmentRequired.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {equipmentRequired.slice(0, 3).map((eq) => (
              <Badge
                key={eq}
                variant="outline"
                className="h-5 px-1.5 text-[10px] font-medium text-muted-foreground"
              >
                {eq}
              </Badge>
            ))}
            {equipmentRequired.length > 3 && (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">
                +{equipmentRequired.length - 3}
              </Badge>
            )}
          </div>
        )}

        {isClinician && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 w-full gap-1.5 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100"
            asChild
          >
            <Link href={`/exercises/${id}/edit`}>
              <Edit className="h-3 w-3" />
              Edit / Add Media
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
