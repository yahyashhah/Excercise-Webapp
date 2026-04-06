"use client";

import { extractYouTubeId, getYouTubeEmbedUrl } from "@/lib/utils/video";

interface UniversalVideoPlayerProps {
  url: string;
  provider?: string | null;
  className?: string;
  autoPlay?: boolean;
}

export function UniversalVideoPlayer({
  url,
  provider,
  className = "",
  autoPlay = false,
}: UniversalVideoPlayerProps) {
  if (!url) return null;

  const ytId = extractYouTubeId(url);

  if (ytId) {
    const embedUrl = getYouTubeEmbedUrl(ytId);
    return (
      <div className={`relative w-full overflow-hidden rounded-lg bg-black ${className}`} style={{ paddingTop: "56.25%" }}>
        <iframe
          src={`${embedUrl}${autoPlay ? "?autoplay=1&mute=1" : ""}`}
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="Video Player"
        />
      </div>
    );
  }

  return (
    <div className={`relative w-full overflow-hidden rounded-lg bg-black ${className}`} style={{ paddingTop: "56.25%" }}>
      <video
        src={url}
        className="absolute inset-0 w-full h-full object-contain"
        controls
        autoPlay={autoPlay}
        playsInline
      />
    </div>
  );
}


