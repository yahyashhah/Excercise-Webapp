import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dumbbell } from "lucide-react";
import { formatBodyRegion, formatDifficulty } from "@/lib/utils/formatting";

interface ExerciseCardProps {
  id: string;
  name: string;
  bodyRegion: string;
  difficultyLevel: string;
  equipmentRequired: string[];
  description?: string | null;
}

const difficultyColors: Record<string, string> = {
  BEGINNER: "bg-green-100 text-green-700",
  INTERMEDIATE: "bg-amber-100 text-amber-700",
  ADVANCED: "bg-red-100 text-red-700",
};

export function ExerciseCard({
  id,
  name,
  bodyRegion,
  difficultyLevel,
  equipmentRequired,
  description,
}: ExerciseCardProps) {
  return (
    <Link href={`/exercises/${id}`}>
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="p-5">
          <div className="mb-3 flex items-start justify-between">
            <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
              <Dumbbell className="h-5 w-5" />
            </div>
            <Badge className={difficultyColors[difficultyLevel] || ""} variant="secondary">
              {formatDifficulty(difficultyLevel)}
            </Badge>
          </div>
          <h3 className="mb-1 font-semibold text-slate-900">{name}</h3>
          <p className="mb-3 text-sm text-slate-500">{formatBodyRegion(bodyRegion)}</p>
          {description && (
            <p className="mb-3 line-clamp-2 text-sm text-slate-600">{description}</p>
          )}
          {equipmentRequired.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {equipmentRequired.map((eq) => (
                <Badge key={eq} variant="outline" className="text-xs">
                  {eq}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
