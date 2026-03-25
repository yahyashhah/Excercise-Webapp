/**
 * backfill-exercise-media.ts
 *
 * Repairs broken image URLs, fills missing image URLs, and ensures every active
 * exercise has a tutorial video URL.
 *
 * Run with: npx tsx lib/db/seed/backfill-exercise-media.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FREE_EXERCISE_DB_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const FREE_EXERCISE_IMAGE_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
const WGER_API =
  "https://wger.de/api/v2/exerciseinfo/?format=json&language=2&limit=100";

interface FreeExercise {
  name: string;
  images: string[];
}

interface WgerExercise {
  translations: { name: string; language: number }[];
  images: { image: string }[];
}

function normalize(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;

  const wordsA = new Set(na.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) matches++;
  }

  return (2 * matches) / (wordsA.size + wordsB.size);
}

function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1) || null;
    }

    const vParam = parsed.searchParams.get("v");
    if (vParam) return vParam;

    const embedMatch = parsed.pathname.match(/\/embed\/([^/?]+)/);
    if (embedMatch) return embedMatch[1];

    const shortsMatch = parsed.pathname.match(/\/shorts\/([^/?]+)/);
    if (shortsMatch) return shortsMatch[1];

    return null;
  } catch {
    return null;
  }
}

function buildYouTubeSearchUrl(name: string): string {
  const params = new URLSearchParams({
    search_query: `${name} physical therapy exercise tutorial`,
  });
  return `https://www.youtube.com/results?${params.toString()}`;
}

function repairFreeDbImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.includes("raw.githubusercontent.com/yuhonas/free-exercise-db")) {
    return url;
  }
  if (!url.includes("/images/")) {
    return url;
  }

  const marker = "/exercises/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return url;

  const prefix = url.slice(0, markerIndex + marker.length);
  const suffix = url.slice(markerIndex + marker.length);
  const splitIndex = suffix.indexOf("/images/");
  if (splitIndex === -1) return url;

  const correctedTail = suffix.slice(splitIndex + "/images/".length);
  return `${prefix}${correctedTail}`;
}

async function fetchFreeExerciseDB(): Promise<FreeExercise[]> {
  try {
    const res = await fetch(FREE_EXERCISE_DB_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as Array<{
      name: string;
      images: string[];
    }>;

    return data.filter((e) => e.images && e.images.length > 0);
  } catch (err) {
    console.warn("free-exercise-db fetch failed:", err);
    return [];
  }
}

async function fetchWgerPage(url: string): Promise<WgerExercise[]> {
  const results: WgerExercise[] = [];
  let next: string | null = url;
  let page = 0;

  while (next && page < 8) {
    try {
      const res = await fetch(next);
      if (!res.ok) break;

      const data = (await res.json()) as {
        next: string | null;
        results: WgerExercise[];
      };

      results.push(...data.results.filter((e) => e.images.length > 0));
      next = data.next;
      page++;
    } catch {
      break;
    }
  }

  return results;
}

function bestMatchedImage(
  exerciseName: string,
  freeExercises: FreeExercise[],
  wgerExercises: WgerExercise[]
): string | null {
  let bestUrl: string | null = null;
  let bestScore = 0;
  const MIN_SCORE = 0.65;

  for (const fe of freeExercises) {
    const score = similarity(exerciseName, fe.name);
    if (score > bestScore && score >= MIN_SCORE) {
      bestScore = score;
      bestUrl = `${FREE_EXERCISE_IMAGE_BASE}/${fe.images[0]}`;
    }
  }

  for (const we of wgerExercises) {
    const name =
      we.translations.find((t) => t.language === 2)?.name ||
      we.translations[0]?.name;

    const score = similarity(exerciseName, name);
    if (score > bestScore && score >= MIN_SCORE) {
      bestScore = score;
      bestUrl = we.images[0].image.startsWith("http")
        ? we.images[0].image
        : `https://wger.de${we.images[0].image}`;
    }
  }

  return bestUrl;
}

async function main() {
  const exercises = await prisma.exercise.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      videoUrl: true,
    },
  });

  if (exercises.length === 0) {
    console.log("No active exercises found.");
    return;
  }

  console.log(`Active exercises: ${exercises.length}`);
  console.log("Fetching external exercise image sources...");

  const freeExercises = await fetchFreeExerciseDB();
  const wgerExercises = await fetchWgerPage(WGER_API);

  console.log(`free-exercise-db records with images: ${freeExercises.length}`);
  console.log(`wger records with images: ${wgerExercises.length}`);

  let updatedVideo = 0;
  let repairedImage = 0;
  let filledImageFromYouTube = 0;
  let filledImageFromDatasets = 0;

  for (const exercise of exercises) {
    const updates: { imageUrl?: string; videoUrl?: string } = {};

    const currentVideo = exercise.videoUrl?.trim() || null;
    const currentImage = exercise.imageUrl?.trim() || null;

    let nextVideo = currentVideo;
    let nextImage = currentImage;

    if (!nextVideo) {
      nextVideo = buildYouTubeSearchUrl(exercise.name);
      updates.videoUrl = nextVideo;
      updatedVideo++;
    }

    const repaired = repairFreeDbImageUrl(nextImage);
    if (repaired && nextImage && repaired !== nextImage) {
      nextImage = repaired;
      updates.imageUrl = repaired;
      repairedImage++;
    }

    if (!nextImage) {
      const ytId = extractYouTubeId(nextVideo);
      if (ytId) {
        nextImage = `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
        updates.imageUrl = nextImage;
        filledImageFromYouTube++;
      } else {
        const matched = bestMatchedImage(exercise.name, freeExercises, wgerExercises);
        if (matched) {
          nextImage = matched;
          updates.imageUrl = matched;
          filledImageFromDatasets++;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.exercise.update({
        where: { id: exercise.id },
        data: updates,
      });
    }
  }

  const stillMissingImage = await prisma.exercise.count({
    where: { isActive: true, imageUrl: null },
  });
  const stillMissingVideo = await prisma.exercise.count({
    where: { isActive: true, videoUrl: null },
  });

  console.log("\nBackfill complete:");
  console.log(`- Tutorial links added: ${updatedVideo}`);
  console.log(`- Broken free-db image URLs repaired: ${repairedImage}`);
  console.log(`- Missing images filled from YouTube thumbnails: ${filledImageFromYouTube}`);
  console.log(`- Missing images filled from datasets: ${filledImageFromDatasets}`);
  console.log(`- Remaining without imageUrl: ${stillMissingImage}`);
  console.log(`- Remaining without videoUrl: ${stillMissingVideo}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
