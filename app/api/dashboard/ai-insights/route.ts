import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getCurrentUserOrNull } from "@/lib/current-user";
import { generateCoachingInsights } from "@/lib/services/dashboard-ai-insights.service";

function getCachedInsights(trainerId: string) {
  return unstable_cache(
    () => generateCoachingInsights(trainerId),
    ["dashboard-ai-insights", trainerId],
    { revalidate: 3600 }
  )();
}

export async function GET() {
  const user = await getCurrentUserOrNull();
  if (!user || user.role !== "TRAINER") {
    return NextResponse.json({ insights: [] });
  }

  try {
    const insights = await getCachedInsights(user.id);
    return NextResponse.json({ insights });
  } catch (error) {
    console.error("AI insights unavailable:", error);
    // null = "unavailable" (distinct from [] = "no insights")
    return NextResponse.json({ insights: null });
  }
}
