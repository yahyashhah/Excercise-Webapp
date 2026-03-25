"use client";

import { useState } from "react";
import { extractYouTubeId, getYouTubeThumbnail } from "@/lib/utils/video";

const REGION_GRADIENTS: Record<string, string> = {
  LOWER_BODY: "from-blue-400 to-blue-600",
  UPPER_BODY: "from-green-400 to-green-600",
  CORE: "from-amber-400 to-amber-600",
  FULL_BODY: "from-purple-400 to-purple-600",
  BALANCE: "from-teal-400 to-teal-600",
  FLEXIBILITY: "from-pink-400 to-pink-600",
};

interface ExerciseImageProps {
  src: string | null | undefined;
  alt: string;
  bodyRegion: string;
  /** If imageUrl fails/missing, fall back to this YouTube URL's thumbnail */
  videoUrl?: string | null;
  className?: string;
  gradientClassName?: string;
  label?: string;
}

/**
 * Smart exercise image component:
 * 1. Tries imageUrl first
 * 2. If that fails or is absent → tries YouTube thumbnail (from videoUrl)
 * 3. If both fail → shows colored body-region gradient with exercise name
 */
export function ExerciseImage({
  src,
  alt,
  bodyRegion,
  videoUrl,
  className = "absolute inset-0 h-full w-full object-cover",
  gradientClassName = "absolute inset-0 flex items-center justify-center",
  label,
}: ExerciseImageProps) {
  const ytId = videoUrl ? extractYouTubeId(videoUrl) : null;
  const ytThumb = ytId ? getYouTubeThumbnail(ytId) : null;

  // Which sources to try in order
  const sources = [src, ytThumb].filter(Boolean) as string[];

  const [sourceIndex, setSourceIndex] = useState(0);

  const gradient = REGION_GRADIENTS[bodyRegion] ?? "from-slate-400 to-slate-600";
  const currentSrc = sources[sourceIndex];

  if (!currentSrc) {
    return (
      <div className={`bg-linear-to-br ${gradient} ${gradientClassName}`}>
        <span className="text-center text-white text-xs font-semibold px-2 opacity-90 leading-tight">
          {label ?? alt.split(" ").slice(0, 3).join(" ")}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      onError={() => {
        if (sourceIndex + 1 < sources.length) {
          setSourceIndex(sourceIndex + 1);
        } else {
          // All sources failed — force re-render with no src → gradient
          setSourceIndex(sources.length);
        }
      }}
    />
  );
}
