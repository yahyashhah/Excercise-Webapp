/**
 * populate-images-v2.ts
 * Uses free-exercise-db (GitHub, no API key) + wger.de to populate imageUrl for all exercises.
 * Run with: npx tsx lib/db/seed/populate-images-v2.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FREE_EXERCISE_DB_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const FREE_EXERCISE_IMAGE_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

const WGER_API =
  "https://wger.de/api/v2/exerciseinfo/?format=json&language=2&limit=100";

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

interface FreeExercise {
  id: string;
  name: string;
  images: string[];
}

interface WgerExercise {
  id: number;
  translations: { name: string; language: number }[];
  images: { image: string }[];
}

async function fetchFreeExerciseDB(): Promise<FreeExercise[]> {
  try {
    console.log("Fetching free-exercise-db...");
    const res = await fetch(FREE_EXERCISE_DB_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Array<{
      id: string;
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

async function main() {
  // Fetch exercises that still have no image
  const dbExercises = await prisma.exercise.findMany({
    where: { imageUrl: null },
    select: { id: true, name: true },
  });

  if (dbExercises.length === 0) {
    console.log("All exercises already have images. Nothing to do.");
    return;
  }

  console.log(`\n${dbExercises.length} exercises need images.\n`);

  // Source 1: free-exercise-db (GitHub, 800+ exercises with JPG images)
  const freeExercises = await fetchFreeExerciseDB();
  console.log(`free-exercise-db: ${freeExercises.length} exercises with images`);

  // Source 2: wger.de API
  console.log("Fetching wger.de exercises...");
  const wgerExercises = await fetchWgerPage(WGER_API);
  console.log(`wger.de: ${wgerExercises.length} exercises with images\n`);

  let matched = 0;
  let skipped = 0;

  for (const dbEx of dbExercises) {
    let bestUrl: string | null = null;
    let bestScore = 0;

    // Minimum score required — high threshold to avoid wrong gym exercise matches
    const MIN_SCORE = 0.65;

    // Try free-exercise-db first (better quality JPGs)
    for (const fe of freeExercises) {
      const score = similarity(dbEx.name, fe.name);
      if (score > bestScore && score >= MIN_SCORE) {
        bestScore = score;
        bestUrl = `${FREE_EXERCISE_IMAGE_BASE}/${fe.images[0]}`;
      }
    }

    // Try wger.de as fallback
    for (const we of wgerExercises) {
      const name =
        we.translations.find((t) => t.language === 2)?.name ||
        we.translations[0]?.name;
      const score = similarity(dbEx.name, name);
      if (score > bestScore && score >= MIN_SCORE) {
        bestScore = score;
        bestUrl = we.images[0].image.startsWith("http")
          ? we.images[0].image
          : `https://wger.de${we.images[0].image}`;
      }
    }

    if (bestUrl) {
      await prisma.exercise.update({
        where: { id: dbEx.id },
        data: { imageUrl: bestUrl },
      });
      console.log(`  ✓ [${bestScore.toFixed(2)}] ${dbEx.name}`);
      matched++;
    } else {
      skipped++;
    }
  }

  console.log(`\nDone: ${matched} images set, ${skipped} unmatched.`);
  console.log(
    `Unmatched exercises need manual images via Exercise Library → Edit.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
