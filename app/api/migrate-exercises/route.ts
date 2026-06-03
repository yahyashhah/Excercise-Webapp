import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/current-user";
import { backfillExerciseSources } from "@/lib/services/exercise.service";

export async function POST() {
  const ok = await isSuperAdmin();
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await backfillExerciseSources();
  return NextResponse.json({ success: true, result });
}
