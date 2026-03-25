/**
 * resolve-youtube-search-videos.ts
 *
 * Replaces videoUrl values that point to YouTube search pages with
 * direct YouTube watch URLs (first search result), so embeds are stable.
 *
 * Run with: npx tsx lib/db/seed/resolve-youtube-search-videos.ts
 */
import { PrismaClient } from "@prisma/client";
import ytSearch from "yt-search";

const prisma = new PrismaClient();

function parseSearchQuery(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("youtube.com")) return null;

    if (parsed.pathname.startsWith("/results")) {
      const query = parsed.searchParams.get("search_query")?.trim();
      return query && query.length > 0 ? query : null;
    }

    if (parsed.pathname.startsWith("/embed")) {
      const isSearchEmbed = parsed.searchParams.get("listType") === "search";
      if (!isSearchEmbed) return null;
      const query = parsed.searchParams.get("list")?.trim();
      return query && query.length > 0 ? query : null;
    }

    return null;
  } catch {
    return null;
  }
}

function sanitizeQuery(query: string): string {
  return query
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function findFirstVideoUrl(query: string): Promise<string | null> {
  try {
    const result = await ytSearch(query);
    const firstVideo = result.videos?.[0];
    if (!firstVideo?.videoId) return null;
    return `https://www.youtube.com/watch?v=${firstVideo.videoId}`;
  } catch {
    return null;
  }
}

async function main() {
  const exercises = await prisma.exercise.findMany({
    where: {
      isActive: true,
    },
    select: { id: true, name: true, videoUrl: true },
  });

  const candidates = exercises.filter((exercise) =>
    !!parseSearchQuery(exercise.videoUrl ?? "")
  );

  if (candidates.length === 0) {
    console.log("No exercises with YouTube search URLs found.");
    return;
  }

  console.log(`Resolving direct YouTube videos for ${candidates.length} exercises...`);

  let updated = 0;
  let skipped = 0;

  for (const exercise of candidates) {
    const query = parseSearchQuery(exercise.videoUrl ?? "");
    if (!query) {
      skipped++;
      continue;
    }

    // Try exact query first, then a sanitized fallback.
    let directVideoUrl = await findFirstVideoUrl(query);
    if (!directVideoUrl) {
      const simplified = sanitizeQuery(query);
      if (simplified && simplified !== query) {
        directVideoUrl = await findFirstVideoUrl(simplified);
      }
    }
    if (!directVideoUrl) {
      directVideoUrl = await findFirstVideoUrl(
        `${exercise.name} physical therapy exercise`
      );
    }
    if (!directVideoUrl) {
      console.log(`  - skipped: ${exercise.name} (no direct result)`);
      skipped++;
      continue;
    }

    await prisma.exercise.update({
      where: { id: exercise.id },
      data: { videoUrl: directVideoUrl },
    });

    updated++;
    console.log(`  + updated: ${exercise.name}`);
  }

  console.log("\nDone:");
  console.log(`- Updated to direct video links: ${updated}`);
  console.log(`- Skipped: ${skipped}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
