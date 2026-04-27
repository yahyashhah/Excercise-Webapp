"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BODY_REGIONS, DIFFICULTY_LEVELS } from "@/lib/utils/constants";
import { generateProgramAction } from "@/actions/program-actions";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

interface GenerateProgramFormProps {
  patients: { id: string; firstName: string; lastName: string }[];
}

export function GenerateProgramForm({ patients }: GenerateProgramFormProps) {
  const weekDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ] as const;

  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState("BEGINNER");
  const [duration, setDuration] = useState(25);
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [exercisesPerSession, setExercisesPerSession] = useState(6);
  const [circuitsPerSession, setCircuitsPerSession] = useState(1);
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([
    "Monday",
    "Wednesday",
    "Friday",
  ]);

  function toggleArea(area: string) {
    setSelectedAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  }

  function toggleWeekday(day: string) {
    setSelectedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedAreas.length === 0) {
      toast.error("Please select at least one focus area");
      return;
    }
    if (selectedWeekdays.length === 0) {
      toast.error("Please select at least one training day");
      return;
    }
    if (selectedWeekdays.length !== daysPerWeek) {
      toast.error("Days per week must match your selected weekdays");
      return;
    }

    setLoading(true);
    const formData = new FormData(e.currentTarget);

    const result = await generateProgramAction({
      patientId: selectedPatient || null,
      focusAreas: selectedAreas,
      durationMinutes: duration,
      daysPerWeek,
      exercisesPerSession,
      circuitsPerSession,
      preferredWeekdays: selectedWeekdays,
      difficultyLevel: difficulty,
      additionalNotes: (formData.get("notes") as string) || undefined,
      subjective: (formData.get("subjective") as string) || undefined,
      clinicianPrompt: (formData.get("clinicianPrompt") as string) || undefined,
    });

    setLoading(false);

    if (result.success) {
      toast.success("Program generated successfully!");
      router.push(`/programs/${result.data}`);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <form onSubmit={handleGenerate}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            AI Program Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Client <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={selectedPatient}
              onChange={(e) => setSelectedPatient(e.target.value)}
            >
              <option value="">No client — general program template</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Focus Areas *</Label>
            <div className="flex flex-wrap gap-2">
              {BODY_REGIONS.map((r) => (
                <Button
                  key={r.value}
                  type="button"
                  variant={selectedAreas.includes(r.value) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleArea(r.value)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Difficulty Level</Label>
            <div className="flex gap-2">
              {DIFFICULTY_LEVELS.map((d) => (
                <Button
                  key={d.value}
                  type="button"
                  variant={difficulty === d.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDifficulty(d.value)}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Session Duration (minutes)</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {[15, 20, 25, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Days Per Week</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>{d} {d === 1 ? "day" : "days"}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Exercises Per Session</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={exercisesPerSession}
                onChange={(e) => setExercisesPerSession(Number(e.target.value))}
              >
                {[4, 5, 6, 7, 8, 10, 12].map((n) => (
                  <option key={n} value={n}>{n} exercises</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Circuits / Supersets Per Session</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={circuitsPerSession}
                onChange={(e) => setCircuitsPerSession(Number(e.target.value))}
              >
                <option value={0}>None (straight sets only)</option>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>{n} circuit{n > 1 ? "s" : ""}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Training Days</Label>
            <div className="flex flex-wrap gap-2">
              {weekDays.map((day) => (
                <Button
                  key={day}
                  type="button"
                  variant={selectedWeekdays.includes(day) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleWeekday(day)}
                >
                  {day.slice(0, 3)}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Select exactly {daysPerWeek} day{daysPerWeek === 1 ? "" : "s"}.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subjective">Client Subjective</Label>
            <Textarea
              id="subjective"
              name="subjective"
              rows={6}
              placeholder="Paste the full subjective report (pain behavior, aggravating factors, functional limits, goals, etc.)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clinicianPrompt">Program Instructions (Optional)</Label>
            <Textarea
              id="clinicianPrompt"
              name="clinicianPrompt"
              rows={3}
              placeholder='Example: "Act as a DPT and create a 1-week, 3-day PT progression for this subjective."'
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Any specific requirements, modifications, or goals..."
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Program
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}