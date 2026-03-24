"use client";

import {
  isYouTubeUrl,
  extractYouTubeId,
  getYouTubeEmbedUrl,
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
  // Priority 1: Uploadthing-hosted video
  const uploadedVideo = mediaItems?.find((item) => item.mediaType === "video");
  if (uploadedVideo) {
    return (
      <ResponsiveVideoWrapper className={className}>
        <video
          src={uploadedVideo.url}
          controls
          style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
          preload="metadata"
        />
      </ResponsiveVideoWrapper>
    );
  }

  // Priority 2: YouTube URL → embed iframe
  if (videoUrl && isYouTubeUrl(videoUrl)) {
    const videoId = extractYouTubeId(videoUrl);
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
  }

  // Priority 3: Direct video file URL (non-YouTube)
  if (videoUrl) {
    return (
      <ResponsiveVideoWrapper className={className}>
        <video
          src={videoUrl}
          controls
          style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
          preload="metadata"
        />
      </ResponsiveVideoWrapper>
    );
  }

  return null;
}
