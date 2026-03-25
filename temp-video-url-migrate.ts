import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

function toEmbedSearch(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.pathname !== "/results") return url;
    const q = parsed.searchParams.get("search_query");
    if (!q) return url;
    const params = new URLSearchParams({ listType: "search", list: q, rel: "0" });
    return `https://www.youtube.com/embed?${params.toString()}`;
  } catch {
    return url;
  }
}

async function main() {
  const rows = await p.exercise.findMany({
    where: { isActive: true, videoUrl: { startsWith: "https://www.youtube.com/results?" } },
    select: { id: true, videoUrl: true },
  });

  let updated = 0;
  for (const row of rows) {
    const next = toEmbedSearch(row.videoUrl ?? "");
    if (next && next !== row.videoUrl) {
      await p.exercise.update({ where: { id: row.id }, data: { videoUrl: next } });
      updated++;
    }
  }

  console.log(JSON.stringify({ found: rows.length, updated }, null, 2));
}

main().finally(() => p.$disconnect());
