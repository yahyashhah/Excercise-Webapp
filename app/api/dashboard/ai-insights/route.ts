import { NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/current-user";
import { generateCoachingInsights } from "@/lib/services/dashboard-ai-insights.service";

export async function GET() {
  try {
    const user = await getCurrentUserOrNull();
    if (!user || user.role !== "TRAINER") {
      return NextResponse.json({ insights: [] });
    }

    const insights = await generateCoachingInsights(user.id);
    return NextResponse.json({ insights });
  } catch (error) {
    console.error("AI insights route failed:", error);
    return NextResponse.json({ insights: [] });
  }
}
