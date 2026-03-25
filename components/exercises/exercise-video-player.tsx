"use client";

import {
  isYouTubeUrl,
  extractYouTubeId,
} from "@/lib/utils/video";

interface MediaItem {
  id: string;
  mediaType: string;
  url: string;
  thumbnailUrl?: string | null;
  altText?: string | null;
}

interface ExerciseVideoPlayerProps {
  videoUrl?: string | null;
  mediaItems?: MediaItem[];
  className?: string;
}

// Responsive 16:9 wrapper using the padding-top hack — works in all browsers/CSS frameworks
function ResponsiveVideoWrapper({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg overflow-hidden ${className}`}>
      <div style={{ position: "relative", paddingTop: "56.25%", background: "#000" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function ExerciseVideoPlayer({
  videoUrl,
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

  // Priority 2: YouTube URL → embed iframe
  if (isYouTubeUrl(effectiveVideoUrl)) {
    const videoId = extractYouTubeId(effectiveVideoUrl);
    if (videoId) {
      return (
        <ResponsiveVideoWrapper className={className}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?rel=0`}
            style={{ width: "100%", height: "100%", border: "none" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            title="Exercise video demo"
          />
        </ResponsiveVideoWrapper>
      );
    }

    // Backfill may store a YouTube search URL. Render the first search result inline.
    try {
      const parsed = new URL(effectiveVideoUrl);
      const searchQuery = parsed.searchParams.get("search_query")?.trim();
      if (searchQuery) {
        const embedSearch = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(searchQuery)}&rel=0`;
        return (
          <ResponsiveVideoWrapper className={className}>
            <iframe
              src={embedSearch}
              style={{ width: "100%", height: "100%", border: "none" }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title="Exercise video demo"
            />
          </ResponsiveVideoWrapper>
        );
      }
    } catch {
      // Fall through to warning below
    }

    return (
      <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Video URL is set but could not be embedded. Please update to a direct YouTube video link.
      </div>
    );
  }

  // Priority 3: Non-YouTube URL rendered as in-app HTML5 video
  return (
    <ResponsiveVideoWrapper className={className}>
      <video
        src={effectiveVideoUrl}
        controls
        style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
        preload="metadata"
      />
    </ResponsiveVideoWrapper>
  );
}
