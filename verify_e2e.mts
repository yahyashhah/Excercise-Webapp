import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env" });

const briefNS: any = await import("./lib/services/program-brief.service");
const aiNS: any = await import("./lib/services/ai.service");
const brief: any = briefNS.default ?? briefNS;
const ai: any = aiNS.default ?? aiNS;

const mammoth = (await import("mammoth")).default;
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|div|tr)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const buffer = fs.readFileSync("/Users/yahyashah/Downloads/Baseball_Offseason_4_Week_4_Day_Template.docx");
const converted = await mammoth.convertToHtml({ buffer });
const text = htmlToPlainText(converted.value || "");

console.log("=== Calling parseProgramBrief (real AI calls) ===");
const parsed = await brief.parseProgramBrief(text);
console.log("ok:", parsed.ok);
if (!parsed.ok) {
  console.log("errors:", parsed.errors);
  process.exit(1);
}
const data = parsed.data;
console.log("programTitle:", data.programTitle);
console.log("daysPerWeek:", data.daysPerWeek);
console.log("preferredWeekdays:", data.preferredWeekdays);
console.log("sessionBlueprint count:", data.sessionBlueprint?.length);
console.log("weeks present:", [...new Set(data.sessionBlueprint?.map((s: any) => s.weekIndex))]);
console.log("circuits:", data.circuits.map((c: any) => c.name));
console.log("warnings from parse:", data.warnings);

console.log("\n=== Calling generateProgram (real DB + AI matching) ===");
const params = {
  programTitle: data.programTitle,
  focusAreas: data.focusAreas,
  durationMinutes: data.durationMinutes,
  daysPerWeek: data.daysPerWeek,
  circuits: data.circuits.map((c: any) => ({ name: c.name, focusType: c.focusType, exerciseCount: c.exerciseCount, rounds: c.rounds })),
  difficultyLevel: data.difficultyLevel,
  preferredWeekdays: data.preferredWeekdays,
  sessionBlueprint: data.sessionBlueprint,
};
const aiPlan = await ai.generateProgram(params);
console.log("program name:", aiPlan.name);
console.log("workout count:", aiPlan.workouts.length);
console.log("weeks in workouts:", [...new Set(aiPlan.workouts.map((w: any) => w.weekIndex))]);
console.log("sample workout 0:", JSON.stringify({
  name: aiPlan.workouts[0].name,
  dayIndex: aiPlan.workouts[0].dayIndex,
  weekIndex: aiPlan.workouts[0].weekIndex,
  blocks: aiPlan.workouts[0].blocks.map((b: any) => ({ name: b.name, exCount: b.exercises.length, exNames: b.exercises.map((e:any) => e.exerciseName) })),
}, null, 2));
console.log("generateProgram warnings:", aiPlan.warnings);

process.exit(0);
