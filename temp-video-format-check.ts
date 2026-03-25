import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const countSearch = await p.exercise.count({ where: { isActive: true, videoUrl: { startsWith: "https://www.youtube.com/results?" } } });
  const countEmbedSearch = await p.exercise.count({ where: { isActive: true, videoUrl: { startsWith: "https://www.youtube.com/embed?listType=search" } } });
  console.log(JSON.stringify({ countSearch, countEmbedSearch }, null, 2));
}
main().finally(() => p.$disconnect());
