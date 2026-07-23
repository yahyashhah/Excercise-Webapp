// Trainer instructions are free-text — split on line breaks first, and fall
// back to sentence breaks so single-paragraph instructions still read as steps.
export function instructionsToBullets(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
