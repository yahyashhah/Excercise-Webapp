/**
 * populate-images.ts
 *
 * Fetches exercise illustrations from the free Wger fitness API
 * (https://wger.de - open source, no API key required) and matches
 * them to exercises in our MongoDB database by name similarity.
 *
 * Run with:  npx tsx lib/db/seed/populate-images.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Normalize a string for fuzzy matching */
function normalize(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Simple similarity: what fraction of words in `a` appear in `b` */
function similarity(a: string, b: string): number {
  const wa = normalize(a).split(" ");
  const wb = new Set(normalize(b).split(" "));
  const matches = wa.filter((w) => w.length > 2 && wb.has(w)).length;
  return matches / Math.max(wa.length, 1);
}

interface WgerTranslation {
  name: string;
  language: number;
}

interface WgerExercise {
  id: number;
  name?: string;              // sometimes present directly
  translations: WgerTranslation[];
  images: { image: string; is_main: boolean }[];
}

interface WgerResponse {
  count: number;
  next: string | null;
  results: WgerExercise[];
}

async function fetchWgerExercises(): Promise<WgerExercise[]> {
  const all: WgerExercise[] = [];
  let url: string | null =
    "https://wger.de/api/v2/exerciseinfo/?format=json&language=2&status=2&limit=100&offset=0";

  console.log("Fetching exercises from wger.de...");

  while (url) {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`Wger API error: ${res.status} ${res.statusText}`);
      break;
    }

    const data = (await res.json()) as WgerResponse;
    const withImages = data.results.filter((e) => e.images.length > 0);
    all.push(...withImages);
    url = data.next;
    console.log(`  Fetched ${all.length} exercises with images so far...`);

    // Small delay to be polite to the free API
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`Total wger exercises with images: ${all.length}`);
  return all;
}

async function main() {
  console.log("\n=== Exercise Image Auto-Populate ===\n");

  // 1. Fetch our exercises that have no imageUrl
  const ourExercises = await prisma.exercise.findMany({
    where: { isActive: true, imageUrl: null },
    select: { id: true, name: true },
  });

  console.log(`Our exercises missing images: ${ourExercises.length}`);

  if (ourExercises.length === 0) {
    console.log("All exercises already have images. Nothing to do.");
    return;
  }

  // 2. Fetch wger exercises with images
  const wgerExercises = await fetchWgerExercises();

  if (wgerExercises.length === 0) {
    console.log("Could not fetch exercises from wger.de. Check your internet connection.");
    return;
  }

  // 3. Match and update
  let matched = 0;
  let skipped = 0;
  const MATCH_THRESHOLD = 0.25;

  for (const ours of ourExercises) {
    // Find best matching wger exercise
    let bestScore = 0;
    let bestWger: WgerExercise | null = null;

    for (const wger of wgerExercises) {
      // Try top-level name first, then translations (English = language 2)
      const wgerName =
        wger.name ||
        wger.translations.find((t) => t.language === 2)?.name ||
        wger.translations[0]?.name ||
        "";

      if (!wgerName) continue;

      const score = similarity(ours.name, wgerName);
      if (score > bestScore) {
        bestScore = score;
        bestWger = wger;
      }
    }

    if (bestScore >= MATCH_THRESHOLD && bestWger) {
      // Prefer main image, fall back to first image
      const img =
        bestWger.images.find((i) => i.is_main) ?? bestWger.images[0];
      const imageUrl = img.image;
      // Make sure URL is absolute
      const absoluteUrl = imageUrl.startsWith("http")
        ? imageUrl
        : `https://wger.de${imageUrl}`;

      await prisma.exercise.update({
        where: { id: ours.id },
        data: { imageUrl: absoluteUrl },
      });

      const wgerNameDisplay =
        bestWger.name ||
        bestWger.translations.find((t) => t.language === 2)?.name ||
        bestWger.translations[0]?.name ||
        `id:${bestWger.id}`;
      console.log(
        `  ✓ "${ours.name}" → "${wgerNameDisplay}" (score: ${bestScore.toFixed(2)}) — ${absoluteUrl}`
      );
      matched++;
    } else {
      console.log(
        `  ✗ "${ours.name}" — no match found (best score: ${bestScore.toFixed(2)})`
      );
      skipped++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`  Matched:  ${matched} exercises updated with images`);
  console.log(`  Skipped:  ${skipped} exercises (no good match found)`);
  console.log(
    `\nFor exercises without images, go to Exercise Library → Edit to add images manually.`
  );
}

main()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
