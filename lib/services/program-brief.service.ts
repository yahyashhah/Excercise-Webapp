import "server-only";
import OpenAI from "openai";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const REQUIRED_HEADERS = [
  "PROGRAM_TITLE",
  "FOCUS_AREAS",
  "DIFFICULTY",
  "DURATION_MINUTES",
  "DAYS_PER_WEEK",
  "PREFERRED_WEEKDAYS",
  "CIRCUITS",
] as const;

const OPTIONAL_HEADERS = [
  "SUBJECTIVE",
  "CLINICIAN_INSTRUCTIONS",
  "ADDITIONAL_NOTES",
] as const;

const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

const ALLOWED_DIFFICULTY = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

const ALLOWED_CIRCUIT_FOCUS = [
  "WARMUP",
  "LOWER_BODY",
  "UPPER_BODY",
  "CORE",
  "FULL_BODY",
  "BALANCE",
  "FLEXIBILITY",
  "COOLDOWN",
  "CARDIO",
] as const;

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const WEEKDAY_FALLBACK_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type HeaderKey = (typeof ALL_HEADERS)[number];

type CircuitConfig = {
  name: string;
  focusType: string;
  exerciseCount: number;
  rounds?: number;
};

export type ExerciseBlueprint = {
  name: string;
  sets?: number;
  reps?: number;
  durationSeconds?: number;
};

type BlockBlueprint = {
  name: string;
  sets?: number;
  exercises: ExerciseBlueprint[];
};

type SessionBlueprint = {
  dayIndex: number;
  weekIndex?: number;
  title: string;
  blocks: BlockBlueprint[];
};

export type ProgramBriefParsed = {
  programTitle: string;
  focusAreas: string[];
  difficultyLevel: string;
  durationMinutes: number;
  daysPerWeek: number;
  preferredWeekdays: string[];
  circuits: CircuitConfig[];
  preferredExerciseNames?: string[];
  sessionBlueprint?: SessionBlueprint[];
  subjective?: string;
  clinicianPrompt?: string;
  additionalNotes?: string;
};

export type ProgramBriefParseResult =
  | { ok: true; data: ProgramBriefParsed }
  | { ok: false; errors: string[] };

function normalizeText(raw: string) {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseHeaderSections(text: string): Record<HeaderKey, string[]> {
  const lines = normalizeText(text).split("\n");
  const sections = {} as Record<HeaderKey, string[]>;
  let current: HeaderKey | null = null;

  for (const line of lines) {
    const match = line.match(/^([A-Z_ ]+):\s*(.*)$/);
    const headerKey = match?.[1]?.trim().replace(/\s+/g, "_") as HeaderKey | undefined;

    if (headerKey && ALL_HEADERS.includes(headerKey)) {
      current = headerKey;
      sections[current] = [];
      const rest = match?.[2]?.trim();
      if (rest) sections[current].push(rest);
      continue;
    }

    if (current) {
      sections[current].push(line);
    }
  }

  return sections;
}

function parseCircuits(lines: string[]): CircuitConfig[] {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[-*]\s*/, ""))
    .map((l) => l.split("|").map((s) => s.trim()))
    .filter((parts) => parts.length >= 3)
    .map(([name, focusType, exerciseCount, rounds]) => {
      const ft = focusType.toUpperCase();
      const parsedRounds = rounds !== undefined ? Number.parseInt(rounds, 10) : undefined;
      return {
        name,
        focusType: ft,
        exerciseCount: Number.parseInt(exerciseCount, 10),
        rounds: parsedRounds && !Number.isNaN(parsedRounds) ? parsedRounds
          : ft === "WARMUP" || ft === "COOLDOWN" ? 1
          : 3,
      };
    });
}

function normalizeWeekday(value: string) {
  const lower = value.trim().toLowerCase();
  const match = WEEKDAYS.find((d) => d.toLowerCase() === lower);
  return match ?? null;
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseExerciseFromLine(line: string): ExerciseBlueprint | null {
  const cleaned = line.replace(/https?:\/\/\S+/g, "").trim();
  if (!cleaned) return null;
  if (/^(day|block)\b/i.test(cleaned)) return null;
  if (/^[-–—]+$/.test(cleaned)) return null;
  // Skip bare or labelled rest lines (e.g. "A3: rest", "B4: rest", "rest")
  if (/^[A-Z]\d\s*:\s*rest\s*$/i.test(cleaned)) return null;
  if (/^\s*rest\s*$/i.test(cleaned)) return null;
  // Skip instruction/description lines (e.g. "do exercise A1 then A2...")
  if (/^do\s+exercise\b/i.test(cleaned)) return null;
  if (/^rest\s+period\s+is\b/i.test(cleaned)) return null;

  // Extract sets × reps before stripping (e.g. "4x10", "4 x 8/side")
  let sets: number | undefined;
  let reps: number | undefined;
  let durationSeconds: number | undefined;

  const setsRepsMatch = cleaned.match(/\b(\d+)\s*x\s*(\d+)/i);
  if (setsRepsMatch) {
    sets = Number.parseInt(setsRepsMatch[1], 10);
    reps = Number.parseInt(setsRepsMatch[2], 10);
  }

  // Extract duration (e.g. "30sec", "30 sec") — only if no reps found
  const secMatch = cleaned.match(/\b(\d+)\s*sec/i);
  if (secMatch && reps === undefined) {
    durationSeconds = Number.parseInt(secMatch[1], 10);
  }

  const colonMatch = cleaned.match(/^[A-Z]\d\s*:\s*(.+)$/i);
  let name = colonMatch ? colonMatch[1].trim() : cleaned;

  name = name
    .replace(/\s+\d+\s*x\s*[^,]*/gi, "")
    .replace(/\s+x\s*\d+[^,]*/gi, "")
    .replace(/\s+\d+\s*sec[^,]*/gi, "")
    .replace(/\s+\d+\s*yards?[^,]*/gi, "")
    .replace(/\s+\d+\s*each[^,]*/gi, "")
    .replace(/\/side[^,]*/gi, "")
    .replace(/\s+\d+\s*reps?[^,]*/gi, "")
    .replace(/\s+\d+\s*sets?[^,]*/gi, "")
    .trim();

  if (!name) return null;

  return {
    name,
    ...(sets !== undefined && { sets }),
    ...(reps !== undefined && { reps }),
    ...(durationSeconds !== undefined && { durationSeconds }),
  };
}

function inferFocusAreasFromText(text: string) {
  const lower = text.toLowerCase();
  const areas: string[] = [];
  if (lower.includes("lower body") || /\blower\b/.test(lower)) areas.push("lower body");
  if (lower.includes("upper body") || /\bupper\b/.test(lower)) areas.push("upper body");
  if (lower.includes("full body")) areas.push("full body");
  if (lower.includes("core")) areas.push("core");
  if (lower.includes("balance")) areas.push("balance");
  if (lower.includes("plyometric") || lower.includes("plyometrics")) areas.push("plyometrics");
  return Array.from(new Set(areas));
}

function inferCircuitFocusType(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("warm")) return "WARMUP";
  if (lower.includes("cool") || lower.includes("recover") || lower.includes("stretch")) return "COOLDOWN";
  if (lower.includes("plyo") || lower.includes("jump") || lower.includes("sprint") || lower.includes("speed") || lower.includes("cardio") || lower.includes("conditioning")) return "CARDIO";
  if (lower.includes("lower") || lower.includes("leg") || lower.includes("squat") || lower.includes("hip") || lower.includes("glute")) return "LOWER_BODY";
  if (lower.includes("upper") || lower.includes("push") || lower.includes("pull") || lower.includes("press") || lower.includes("row") || lower.includes("shoulder") || lower.includes("arm")) return "UPPER_BODY";
  if (lower.includes("core") || lower.includes("ab") || lower.includes("trunk")) return "CORE";
  if (lower.includes("balance") || lower.includes("stability") || lower.includes("propriocep")) return "BALANCE";
  if (lower.includes("mobility") || lower.includes("flex")) return "FLEXIBILITY";
  if (lower.includes("med ball") || lower.includes("power") || lower.includes("full")) return "FULL_BODY";
  return "FULL_BODY";
}

// ─── Block-header patterns ────────────────────────────────────────────────────
// A "block header" is a line that starts a named section within a session.
// We deliberately require "series", ":", or end-of-line after section keywords
// so that session titles like "Acceleration Day B" are NOT confused with the
// "Acceleration series:" block header.
const BLOCK_HEADER_PATTERNS = [
  /^block\s*[a-z]\b/i,
  /^plyometric[s]?\s*(series|warm[\s-]?up|:|\s*$)/i,
  /^plyo\s*(series|:|\s*$)/i,
  /^med[\s-]?ball[s]?\s*(series|warm[\s-]?up|:|\s*$)/i,
  /^medball[s]?\s*(series|:|\s*$)/i,
  /^mobility\s*(series|:|\s*$)/i,
  /^acceleration\s*(series|:|\s*$)/i,
  /^speed\s*(series|:|\s*$)/i,
  /^cooldown[s]?\s*[:]?(\s|$)/i,
  /^warm[\s-]?up[s]?\s*[:]?(\s|$)/i,
];

function isKnownBlockHeader(line: string): boolean {
  const t = line.trim();
  return BLOCK_HEADER_PATTERNS.some((r) => r.test(t));
}

// Normalise a block header line into a canonical block name
function blockNameFromHeader(line: string): string {
  const t = line.trim().toLowerCase();
  if (/^block\s*([a-z])\b/i.test(line.trim())) {
    const m = line.trim().match(/^block\s*([a-z])\b/i);
    return `Block ${m![1].toUpperCase()}`;
  }
  if (/plyometric|^plyo\b/i.test(t)) return "Plyometrics";
  if (/med[\s-]?ball|medball/i.test(t)) return "Med Ball";
  if (/mobility/i.test(t)) return "Mobility";
  if (/acceleration/i.test(t)) return "Acceleration";
  if (/speed/i.test(t)) return "Speed";
  if (/cooldown/i.test(t)) return "Cooldown";
  if (/warm[\s-]?up/i.test(t)) return "Warm Up";
  return line.trim().replace(/:\s*$/, "").trim() || "General";
}

function isSeparatorLine(line: string): boolean {
  const t = line.trim();
  return t.length >= 3 && /^[-—–=_]+$/.test(t);
}

// An "exercise-like" line: labelled exercise (A1: or A3 without colon), has sets×reps, or has a URL
function looksLikeExercise(line: string): boolean {
  const t = line.trim();
  return (
    /^[A-Z]\d[\s:]/i.test(t) ||   // A1: chin ups  OR  A3 deep chest stretch (no colon)
    /\b\d+\s*x\s*\d+\b/i.test(t) ||
    /https?:\/\//i.test(t)
  );
}

// Heuristic: a short line (≤ 8 words), no exercise-movement verbs, no "x N" pattern
// AND followed within 12 non-empty lines by a block header → it's a session title.
function isSessionTitleLine(lineIdx: number, lines: string[]): boolean {
  const line = lines[lineIdx].trim();
  if (!line || line.length > 80) return false;
  if (isKnownBlockHeader(line)) return false;
  if (looksLikeExercise(line)) return false;
  if (isSeparatorLine(line)) return false;
  if (/^day\s*\d+/i.test(line)) return false;

  // Brief-format header lines (e.g. "PREFERRED_WEEKDAYS: Monday", "PROGRAM_TITLE:", "SUBJECTIVE:")
  if (/^[A-Z_]{4,}\s*:/.test(line)) return false;
  // Pipe-separated lines are CIRCUITS brief format ("- Main Circuit | LOWER_BODY | 6")
  if (/\|/.test(line)) return false;
  // Any line containing "/" is either a prescription ratio ("90/90s", "5/side") or a
  // schedule description ("3 days / week — Monday, Wednesday, Friday") — not a session title.
  if (line.includes('/')) return false;

  const wordCount = line.replace(/\([^)]*\)/g, "").split(/\s+/).filter(Boolean).length;
  if (wordCount < 2) return false; // Single words like "Butterfly" or "90/90s" are not session titles
  if (wordCount > 9) return false;
  // Contains common movement/exercise words → likely a drill or exercise name, not a session title
  if (/\b(hops?|jumps?|skips?|bounds?|sprints?|throws?|toss(?:es)?|slams?|planks?|dribblers?|walks?|stretch(?:es)?|passes?|curls?|raises?|swings?|rotations?)\b/i.test(line)) return false;
  // Has "x N" pattern (with or without units like "60sec", "5m") — exercise prescription
  if (/\bx\s*\d/i.test(line)) return false;

  // Look ahead for a block header within 12 non-empty lines
  for (let j = lineIdx + 1; j < Math.min(lineIdx + 14, lines.length); j++) {
    const next = lines[j].trim();
    if (!next) continue;
    if (isKnownBlockHeader(next)) return true;
    if (looksLikeExercise(next)) return false;
    if (isSeparatorLine(next)) return false;
  }
  return false;
}

function extractSessionBlueprint(text: string) {
  const lines = normalizeText(text).split("\n");

  // ── Step 1: collect all session-start positions ──────────────────────────
  const sessionStarts: { index: number; title: string }[] = [];
  const usedLines = new Set<number>();

  // Pass A – explicit DAY N headers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const dayMatch = line.match(/^day\s*(\d+)\b\s*(.*)$/i);
    if (!dayMatch) continue;

    const dayNum = Number.parseInt(dayMatch[1], 10);
    let title = dayMatch[2]?.replace(/^[/|\s]+/, "").trim() || "";
    usedLines.add(i);

    // Look ahead for an inline subtitle (next non-empty, non-block, non-exercise line)
    if (!title) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const next = lines[j].trim();
        if (!next) { usedLines.add(j); continue; }
        if (
          !isKnownBlockHeader(next) &&
          !looksLikeExercise(next) &&
          !isSeparatorLine(next) &&
          !/^day\s*\d+/i.test(next)
        ) {
          title = next.replace(/:$/, "").trim();
          usedLines.add(j);
        }
        break;
      }
    }

    sessionStarts.push({
      index: i,
      title: title ? `DAY ${dayNum} - ${title}` : `DAY ${dayNum}`,
    });
  }

  // Pass B – separator lines (———) whose next non-empty line is a session title
  for (let i = 0; i < lines.length; i++) {
    if (usedLines.has(i) || !isSeparatorLine(lines[i])) continue;
    usedLines.add(i);

    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const next = lines[j].trim();
      if (!next) { usedLines.add(j); continue; }
      if (usedLines.has(j) || /^day\s*\d+/i.test(next)) break;
      if (!isKnownBlockHeader(next) && !looksLikeExercise(next)) {
        sessionStarts.push({ index: j, title: next.replace(/:$/, "").trim() });
        usedLines.add(j);
      }
      break;
    }
  }

  // Pass C – named session titles detected by look-ahead (no separator / DAY prefix)
  // Track whether we have seen at least one exercise-like line before the current candidate.
  // This prevents document metadata at the top (title, focus areas, schedule) from being
  // treated as session boundaries when no exercises precede them.
  let seenExerciseBeforeCandidate = false;
  for (let i = 0; i < lines.length; i++) {
    if (usedLines.has(i)) continue;
    const line = lines[i].trim();
    if (!line) continue;
    if (looksLikeExercise(line)) {
      seenExerciseBeforeCandidate = true;
      continue;
    }
    if (!isSessionTitleLine(i, lines)) continue;
    // Skip candidates that appear in a metadata cluster before the first exercise line
    if (!seenExerciseBeforeCandidate && sessionStarts.length > 0) continue;
    const already = sessionStarts.some((s) => Math.abs(s.index - i) <= 2);
    if (!already) {
      sessionStarts.push({ index: i, title: lines[i].trim().replace(/:$/, "").trim() });
      usedLines.add(i);
    }
  }

  sessionStarts.sort((a, b) => a.index - b.index);

  // ── Step 2: shared block-parsing helper ──────────────────────────────────
  function parseSegmentBlocks(segment: string[]) {
    let currentBlock = "Warm Up";
    let currentBlockSets: number | undefined;
    const blocks = new Map<string, { sets?: number; exercises: ExerciseBlueprint[] }>();
    const names: string[] = [];

    function ensureBlock(name: string, bSets?: number) {
      if (!blocks.has(name)) blocks.set(name, { sets: bSets, exercises: [] });
      return blocks.get(name)!;
    }

    for (const rawLine of segment) {
      const line = rawLine.trim();
      if (!line || isSeparatorLine(line)) continue;

      // Block A / B / C (with optional set-count)
      const blockMatch = line.match(/^block\s*([A-Z])\b/i);
      if (blockMatch) {
        currentBlock = `Block ${blockMatch[1].toUpperCase()}`;
        const setsMatch = line.match(/:\s*(\d+)\s*sets?/i);
        currentBlockSets = setsMatch ? Number.parseInt(setsMatch[1], 10) : undefined;
        ensureBlock(currentBlock, currentBlockSets);
        continue;
      }

      // Named section headers (Plyometrics, Med Ball, Mobility, etc.)
      if (isKnownBlockHeader(line)) {
        currentBlock = blockNameFromHeader(line);
        currentBlockSets = undefined;
        const setsMatch = line.match(/:\s*(\d+)\s*sets?/i);
        if (setsMatch) currentBlockSets = Number.parseInt(setsMatch[1], 10);
        ensureBlock(currentBlock, currentBlockSets);
        continue;
      }

      const exercise = parseExerciseFromLine(line);
      if (!exercise) continue;

      if (exercise.sets === undefined && currentBlockSets !== undefined) {
        exercise.sets = currentBlockSets;
      }

      ensureBlock(currentBlock, currentBlockSets).exercises.push(exercise);
      names.push(exercise.name);
    }

    const blocksArray = Array.from(blocks.entries())
      .filter(([, b]) => b.exercises.length > 0)
      .map(([name, b]) => ({ name, sets: b.sets, exercises: b.exercises }));

    return { blocksArray, names };
  }

  // ── Step 3: single-session fallback (no session boundaries found) ─────────
  if (!sessionStarts.length) {
    const { blocksArray, names } = parseSegmentBlocks(lines);
    if (!blocksArray.length) {
      return { sessions: [] as SessionBlueprint[], exerciseNames: [] };
    }
    return {
      sessions: [{ dayIndex: 0, title: "DAY 1", blocks: blocksArray }],
      exerciseNames: names,
    };
  }

  // ── Step 4: parse each detected session ──────────────────────────────────
  const sessions: SessionBlueprint[] = [];
  const exerciseNames: string[] = [];

  for (let i = 0; i < sessionStarts.length; i++) {
    const current = sessionStarts[i];
    const next = sessionStarts[i + 1];
    // +1 to skip the title line itself (already used as the session title)
    const start = current.index + 1;
    const end = next ? next.index : lines.length;
    const segment = lines.slice(start, end);

    const { blocksArray, names } = parseSegmentBlocks(segment);
    exerciseNames.push(...names);

    if (blocksArray.length > 0) {
      sessions.push({
        dayIndex: i,
        title: current.title,
        blocks: blocksArray,
      });
    }
  }

  return { sessions, exerciseNames };
}

function inferDaysFromText(text: string) {
  const matches = Array.from(text.matchAll(/\bday\s*(\d+)\b/gi));
  const days = matches.map((m) => Number.parseInt(m[1], 10)).filter((n) => Number.isFinite(n));
  const unique = Array.from(new Set(days)).sort((a, b) => a - b);
  return unique.length ? unique.length : null;
}

function inferProgramTitle(text: string) {
  const lines = normalizeText(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return "";

  const firstNonDay = lines.find((l) => !/^day\s*\d+/i.test(l));
  return firstNonDay || lines[0];
}

function inferDifficulty(text: string) {
  const lower = text.toLowerCase();
  if (/(advanced|plyometric|depth jump|barbell|chin up|copenhagen|med ball)/i.test(lower)) {
    return "INTERMEDIATE";
  }
  if (/beginner|rehab|gentle|basic/i.test(lower)) return "BEGINNER";
  if (/intermediate/i.test(lower)) return "INTERMEDIATE";
  if (/advanced|elite/i.test(lower)) return "ADVANCED";
  return "";
}

function inferDurationMinutes(text: string) {
  const exerciseCount = Array.from(text.matchAll(/\b[A-Z]\d\s*:/g)).length;
  if (exerciseCount <= 0) return null;
  const estimate = Math.round(exerciseCount * 3.5);
  return Math.min(120, Math.max(30, estimate));
}

function validate(parsed: ProgramBriefParsed): string[] {
  const errors: string[] = [];

  if (!parsed.programTitle) errors.push("PROGRAM_TITLE is required");
  if (!parsed.focusAreas.length) errors.push("FOCUS_AREAS is required");
  if (!ALLOWED_DIFFICULTY.includes(parsed.difficultyLevel as any)) {
    errors.push("DIFFICULTY must be BEGINNER, INTERMEDIATE, or ADVANCED");
  }
  if (!Number.isFinite(parsed.durationMinutes) || parsed.durationMinutes <= 0) {
    errors.push("DURATION_MINUTES must be a positive number");
  }
  if (!Number.isFinite(parsed.daysPerWeek) || parsed.daysPerWeek < 1 || parsed.daysPerWeek > 7) {
    errors.push("DAYS_PER_WEEK must be between 1 and 7");
  }
  if (!parsed.preferredWeekdays.length) {
    errors.push("PREFERRED_WEEKDAYS is required");
  }
  if (parsed.preferredWeekdays.length !== parsed.daysPerWeek) {
    errors.push("PREFERRED_WEEKDAYS count must match DAYS_PER_WEEK");
  }
  if (!parsed.circuits.length) {
    errors.push("CIRCUITS must include at least one circuit");
  }

  parsed.circuits.forEach((c, idx) => {
    if (!c.name) errors.push(`CIRCUITS line ${idx + 1} missing name`);
    if (!ALLOWED_CIRCUIT_FOCUS.includes(c.focusType as any)) {
      errors.push(
        `CIRCUITS line ${idx + 1} focus must be one of: ${ALLOWED_CIRCUIT_FOCUS.join(", ")}`
      );
    }
    if (!Number.isFinite(c.exerciseCount) || c.exerciseCount < 1) {
      errors.push(`CIRCUITS line ${idx + 1} exercise count must be >= 1`);
    }
  });

  return errors;
}

export async function extractProgramBriefText(fileUrl: string, fileName: string) {
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch file: ${res.status}`);
  }

  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".pdf")) {
    const buffer = Buffer.from(await res.arrayBuffer());
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  }

  if (lowerName.endsWith(".docx")) {
    const buffer = Buffer.from(await res.arrayBuffer());
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value || "";
  }

  return await res.text();
}

export function parseProgramBrief(text: string): ProgramBriefParseResult {
  const sections = parseHeaderSections(text);
  const missingRequired = REQUIRED_HEADERS.filter((h) => !sections[h]);
  if (missingRequired.length) {
    return {
      ok: false,
      errors: missingRequired.map((h) => `${h} section is required`),
    };
  }

  const programTitle = (sections.PROGRAM_TITLE || []).join(" ").trim();
  const focusAreas = splitCommaList((sections.FOCUS_AREAS || []).join(" "));
  const difficultyLevel = (sections.DIFFICULTY || []).join(" ").trim().toUpperCase();
  const durationMinutes = Number.parseInt((sections.DURATION_MINUTES || []).join(" "), 10);
  const daysPerWeek = Number.parseInt((sections.DAYS_PER_WEEK || []).join(" "), 10);
  const preferredWeekdays = splitCommaList((sections.PREFERRED_WEEKDAYS || []).join(" "))
    .map(normalizeWeekday)
    .filter((d) => d !== null) as string[];

  const circuits = parseCircuits(sections.CIRCUITS || []);

  const subjective = (sections.SUBJECTIVE || []).join("\n").trim() || undefined;
  const clinicianPrompt =
    (sections.CLINICIAN_INSTRUCTIONS || []).join("\n").trim() || undefined;
  const additionalNotes =
    (sections.ADDITIONAL_NOTES || []).join("\n").trim() || undefined;

  const parsed: ProgramBriefParsed = {
    programTitle,
    focusAreas,
    difficultyLevel,
    durationMinutes,
    daysPerWeek,
    preferredWeekdays,
    circuits,
    subjective,
    clinicianPrompt,
    additionalNotes,
  };

  const errors = validate(parsed);
  if (errors.length) return { ok: false, errors };

  return { ok: true, data: parsed };
}

function normalizeInferred(parsed: ProgramBriefParsed): ProgramBriefParsed {
  const difficultyRaw = parsed.difficultyLevel ?? "";
  const difficulty = difficultyRaw ? difficultyRaw.toUpperCase() : "";
  const safeDays = Number.isFinite(parsed.daysPerWeek)
    ? Math.max(1, Math.min(parsed.daysPerWeek, 7))
    : parsed.daysPerWeek;

  return {
    ...parsed,
    difficultyLevel: difficulty,
    durationMinutes: parsed.durationMinutes,
    daysPerWeek: safeDays,
    preferredWeekdays: (parsed.preferredWeekdays || [])
      .map(normalizeWeekday)
      .filter(Boolean) as string[],
    circuits: parsed.circuits || [],
  };
}

export async function parseProgramBriefFlexible(
  text: string
): Promise<ProgramBriefParseResult> {
  const strict = parseProgramBrief(text);
  if (strict.ok) return strict;

  const systemPrompt = `You extract a structured exercise program brief from unstructured text. The program may be for any context: rehabilitation, athletic performance, strength & conditioning, general fitness, or sports-specific training.\n\nRules:\n- Always return valid JSON only, no markdown.\n- Infer all values from the text. Do NOT invent defaults. If a value cannot be inferred, set it to null or an empty array.\n- Required keys: programTitle, focusAreas, difficultyLevel, durationMinutes, daysPerWeek, preferredWeekdays, circuits.\n- difficultyLevel must be BEGINNER, INTERMEDIATE, or ADVANCED.\n- preferredWeekdays must be valid weekday names. If only day numbers exist, map Day 1..N to Monday.. for output.\n- circuits is an array: { name, focusType, exerciseCount }. Use the actual block/section names from the document (e.g. "Plyometrics", "Block A", "Med Ball Series", "Warm Up").\n- focusType must be one of: WARMUP, LOWER_BODY, UPPER_BODY, CORE, FULL_BODY, BALANCE, FLEXIBILITY, COOLDOWN, CARDIO.\n- exerciseCount should be consistent per session; infer from blocks or lists if present.\n- If days are listed (e.g. DAY 1, DAY 2), use that count for daysPerWeek. If no day headers, count = 1.\n- Infer durationMinutes from volume if not stated.\n- Keep focusAreas short (2-5 items). For athletic programs use terms like "plyometrics", "upper body", "lower body", "power", "conditioning".`;

  const userPrompt = `Extract a program brief from this content:\n\n${text}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const responseText = response.choices[0].message.content ?? "{}";
  const inferred = JSON.parse(responseText) as ProgramBriefParsed;
  const normalized = normalizeInferred(inferred);

  if (!normalized.programTitle) {
    normalized.programTitle = inferProgramTitle(text);
  }

  const blueprint = extractSessionBlueprint(text);
  if (blueprint.sessions.length) {
    if (!normalized.daysPerWeek || !Number.isFinite(normalized.daysPerWeek) || normalized.daysPerWeek > 7) {
      // For multi-week programs (>7 sessions), cap at 7 so daysPerWeek stays valid.
      // GPT-4o should have correctly inferred the per-week count from the document context;
      // if it failed we fall back to the raw session count capped at 7.
      normalized.daysPerWeek = Math.min(blueprint.sessions.length, 7);
    }

    if (!normalized.programTitle) {
      normalized.programTitle = blueprint.sessions[0].title;
    }

    normalized.preferredExerciseNames = Array.from(
      new Set(blueprint.exerciseNames)
    );
    normalized.sessionBlueprint = blueprint.sessions;

    // Always derive circuits from the actual block structure in the brief.
    // GPT-4o often mis-identifies the days themselves as circuits, so we
    // override whatever it returned with the real block names (Warm Up, Block A, …).
    {
      const circuitCounts = new Map<string, number>();
      blueprint.sessions.forEach((session) => {
        session.blocks.forEach((block) => {
          const count = block.exercises.length;
          const current = circuitCounts.get(block.name) ?? 0;
          if (count > current) circuitCounts.set(block.name, count);
        });
      });

      if (circuitCounts.size > 0) {
        normalized.circuits = Array.from(circuitCounts.entries()).map(
          ([name, count]) => {
            const ft = inferCircuitFocusType(name);
            return {
              name,
              focusType: ft,
              exerciseCount: count,
              rounds: ft === "WARMUP" || ft === "COOLDOWN" ? 1 : 3,
            };
          }
        );
      }
    }

    const blueprintText = blueprint.sessions
      .map((session) => {
        const blocksText = session.blocks
          .map((block) => {
            const exerciseList = block.exercises
              .map((e) => {
                const rx =
                  e.sets != null && e.reps != null
                    ? ` ${e.sets}x${e.reps}`
                    : e.sets != null && e.durationSeconds != null
                      ? ` ${e.sets}x${e.durationSeconds}sec`
                      : "";
                return `${e.name}${rx}`;
              })
              .join(", ");
            return `${block.name}${block.sets != null ? ` (${block.sets} sets)` : ""}: ${exerciseList}`;
          })
          .join("\n");
        return `${session.title}\n${blocksText}`;
      })
      .join("\n\n");

    const structurePrompt = `SESSION STRUCTURE (STRICT):\n- Treat each DAY as a session with the exact title shown.\n- Treat Block A/B/C and Warm Up as circuits.\n- Use EXACT exercise names listed for each day and block.\n- Do NOT add new exercises.\n- If a circuit requires more exercises than listed for a day, repeat the last listed exercise to reach the required count.\n\n${blueprintText}`;

    normalized.clinicianPrompt = [
      normalized.clinicianPrompt,
      structurePrompt,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (!normalized.daysPerWeek || !Number.isFinite(normalized.daysPerWeek)) {
    const inferredDays = inferDaysFromText(text);
    if (inferredDays) normalized.daysPerWeek = inferredDays;
  }

  // Hard fallback: if daysPerWeek is still invalid, default to 1
  if (!Number.isFinite(normalized.daysPerWeek) || normalized.daysPerWeek < 1) {
    normalized.daysPerWeek = 1;
  }

  if (!normalized.preferredWeekdays.length) {
    normalized.preferredWeekdays = WEEKDAY_FALLBACK_ORDER.slice(0, normalized.daysPerWeek);
  }

  // Trim or pad preferredWeekdays to always match daysPerWeek
  if (normalized.preferredWeekdays.length !== normalized.daysPerWeek) {
    if (normalized.preferredWeekdays.length > normalized.daysPerWeek) {
      normalized.preferredWeekdays = normalized.preferredWeekdays.slice(0, normalized.daysPerWeek);
    } else {
      const existing = new Set(normalized.preferredWeekdays);
      for (const day of WEEKDAY_FALLBACK_ORDER) {
        if (normalized.preferredWeekdays.length >= normalized.daysPerWeek) break;
        if (!existing.has(day)) normalized.preferredWeekdays.push(day);
      }
    }
  }

  if (!normalized.difficultyLevel) {
    normalized.difficultyLevel = inferDifficulty(text);
  }

  if (!normalized.focusAreas.length) {
    normalized.focusAreas = inferFocusAreasFromText(text);
  }

  if (!normalized.durationMinutes || !Number.isFinite(normalized.durationMinutes)) {
    const inferredDuration = inferDurationMinutes(text);
    if (inferredDuration) normalized.durationMinutes = inferredDuration;
  }

  // Re-index sessions for multi-week programs: assign weekIndex and per-week dayIndex
  if (normalized.sessionBlueprint?.length && normalized.daysPerWeek > 0) {
    const dpw = normalized.daysPerWeek;
    if (normalized.sessionBlueprint.length > dpw) {
      normalized.sessionBlueprint = normalized.sessionBlueprint.map((s, i) => ({
        ...s,
        weekIndex: Math.floor(i / dpw),
        dayIndex: i % dpw,
      }));
    }
  }

  const errors = validate(normalized);
  if (errors.length) return { ok: false, errors };
  return { ok: true, data: normalized };
}
