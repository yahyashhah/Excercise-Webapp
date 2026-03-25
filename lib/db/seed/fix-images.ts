/**
 * fix-images.ts
 *
 * 1. Clears clearly WRONG image matches (wger gym images on clinical exercises)
 * 2. For any exercise that already has a videoUrl (YouTube), sets imageUrl to the YouTube thumbnail
 *
 * Run with: npx tsx lib/db/seed/fix-images.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Exercises whose current imageUrl is clearly a wrong match — clear them so the
// gradient fallback shows instead of a wrong photo
const BAD_MATCH_NAMES = [
  "Chin Tucks",             // matched to chin-ups photo
  "Curl-Ups (McGill)",      // matched to barbell
  "Ab Wheel Rollout (Kneeling)", // matched to barbell
  "Supine Spinal Twist",    // matched to plate exercise
  "Side Stepping",          // matched to cross-body crunch
  "Bulgarian Split Squat",  // matched to same image as Wall Squats
  "Prone Y-T-W Raises",     // matched to donkey kick
  "Push-Up (Standard)",     // matched to clock push-up (different)
  "Bicycle Crunches",       // matched to decline crunch
  "BOSU Ball Single Leg Stand", // matched to ball leg curl
  "Thread the Needle",      // matched to unrelated exercise
  "Star Excursion Balance Reach", // matched to unrelated
  "Glute Squeeze (Prone)",  // matched to glute kickback (different)
  "Trunk Rotation (Seated)", // matched to external rotation (different)
  "Band Pull-Aparts",       // matched to unrelated
];

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1) || null;
    const v = parsed.searchParams.get("v");
    if (v) return v;
    const embed = parsed.pathname.match(/\/embed\/([^/?]+)/);
    if (embed) return embed[1];
    const shorts = parsed.pathname.match(/\/shorts\/([^/?]+)/);
    if (shorts) return shorts[1];
    return null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("Step 1: Clearing bad image matches...");
  const cleared = await prisma.exercise.updateMany({
    where: { name: { in: BAD_MATCH_NAMES } },
    data: { imageUrl: null },
  });
  console.log(`  Cleared ${cleared.count} bad image matches.`);

  console.log("\nStep 2: Populating imageUrl from YouTube thumbnails...");
  const withVideo = await prisma.exercise.findMany({
    where: {
      videoUrl: { not: null },
      imageUrl: null,
    },
    select: { id: true, name: true, videoUrl: true },
  });

  console.log(`  Found ${withVideo.length} exercises with videoUrl but no imageUrl.`);

  let set = 0;
  for (const ex of withVideo) {
    const ytId = extractYouTubeId(ex.videoUrl!);
    if (ytId) {
      await prisma.exercise.update({
        where: { id: ex.id },
        data: { imageUrl: `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` },
      });
      console.log(`  ✓ ${ex.name}`);
      set++;
    }
  }

  console.log(`\nDone. ${cleared.count} bad matches cleared, ${set} YouTube thumbnails set.`);
  console.log("\nNext: Add YouTube URLs to exercises via Exercise Library → Edit.");
  console.log("YouTube thumbnail will automatically become the exercise image.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
