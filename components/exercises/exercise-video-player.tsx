"use client";

import { UniversalVideoPlayer } from "./universal-video-player";

interface MediaItem {
  id: string;
  mediaType: string;
  url: string;
  thumbnailUrl?: string | null;
  altText?: string | null;
}

interface ExerciseVideoPlayerProps {
  videoUrl?: string | null;
  videoProvider?: string | null;
  mediaItems?: MediaItem[];
  className?: string;
}

export function ExerciseVideoPlayer({
  videoUrl,
  videoProvider,
  mediaItems,
  className = "",
}: ExerciseVideoPlayerProps) {
  // Priority 1: exercise media table video, then fallback to exercise.videoUrl
  const mediaVideo = mediaItems?.find(
    (item) => item.mediaType?.toLowerCase() === "video" && !!item.url
  );
  const effectiveVideoUrl = mediaVideo?.url ?? videoUrl;

  if (!effectiveVideoUrl) {
    return null;
  }

  return (
    <UniversalVideoPlayer 
      url={effectiveVideoUrl} 
      provider={videoProvider} 
      className={className} 
    />
  );
}

