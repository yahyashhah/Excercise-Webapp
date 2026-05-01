"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BODY_REGIONS, DIFFICULTY_LEVELS } from "@/lib/utils/constants";
import { generateProgramAction } from "@/actions/program-actions";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";

interface CircuitConfig {
  id: string;
  name: string;
  focusType: string;
  exerciseCount: number;
}

const CIRCUIT_FOCUS_OPTIONS = [
  { value: "WARMUP", label: "Warm Up" },
  { value: "LOWER_BODY", label: "Lower Body" },
  { value: "UPPER_BODY", label: "Upper Body" },
  { value: "CORE", label: "Core" },
  { value: "FULL_BODY", label: "Full Body" },
  { value: "BALANCE", label: "Balance" },
  { value: "FLEXIBILITY", label: "Flexibility / Mobility" },
  { value: "COOLDOWN", label: "Cool Down" },
  { value: "CARDIO", label: "Cardio" },
];

interface GenerateProgramFormProps {
  patients: { id: string; firstName: string; lastName: string }[];
  initialPatientId?: string;
}

export function GenerateProgramForm({ patients, initialPatientId }: GenerateProgramFormProps) {
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
  const [selectedPatient, setSelectedPatient] = useState(initialPatientId ?? "");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState("BEGINNER");
  const [duration, setDuration] = useState(25);
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([
    "Monday",
    "Wednesday",
    "Friday",
  ]);
  const [circuits, setCircuits] = useState<CircuitConfig[]>([
    { id: "1", name: "Warm Up", focusType: "WARMUP", exerciseCount: 4 },
    { id: "2", name: "Main Circuit", focusType: "FULL_BODY", exerciseCount: 6 },
    { id: "3", name: "Cool Down", focusType: "COOLDOWN", exerciseCount: 3 },
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

  function addCircuit() {
    setCircuits((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        name: "Circuit",
        focusType: "FULL_BODY",
        exerciseCount: 4,
      },
    ]);
  }

  function removeCircuit(id: string) {
    if (circuits.length <= 1) {
      toast.error("At least one circuit is required");
      return;
    }
    setCircuits((prev) => prev.filter((c) => c.id !== id));
  }

  function updateCircuit(id: string, updates: Partial<Omit<CircuitConfig, "id">>) {
    setCircuits((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }

  function moveCircuit(id: string, direction: "up" | "down") {
    setCircuits((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
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
    if (circuits.some((c) => c.exerciseCount < 1)) {
      toast.error("Each circuit must have at least 1 exercise");
      return;
    }

    setLoading(true);
    const formData = new FormData(e.currentTarget);

    const result = await generateProgramAction({
      patientId: selectedPatient || null,
      focusAreas: selectedAreas,
      durationMinutes: duration,
      daysPerWeek,
      circuits: circuits.map(({ name, focusType, exerciseCount }) => ({
        name,
        focusType,
        exerciseCount,
      })),
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

  const totalExercises = circuits.reduce((sum, c) => sum + c.exerciseCount, 0);

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

          {/* Per-Circuit Configuration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Circuit Structure</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure each circuit — name, focus, and exact exercise count.
                  Total: <span className="font-medium text-foreground">{totalExercises} exercises</span> per session.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCircuit}
                className="shrink-0"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Circuit
              </Button>
            </div>

            <div className="space-y-2">
              {circuits.map((circuit, index) => (
                <div
                  key={circuit.id}
                  className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3"
                >
                  {/* Reorder buttons */}
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveCircuit(circuit.id, "up")}
                      className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={index === circuits.length - 1}
                      onClick={() => moveCircuit(circuit.id, "down")}
                      className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>

                  <span className="text-xs font-medium text-muted-foreground w-5 shrink-0">
                    {index + 1}
                  </span>

                  {/* Name */}
                  <Input
                    value={circuit.name}
                    onChange={(e) => updateCircuit(circuit.id, { name: e.target.value })}
                    placeholder="Circuit name"
                    className="h-8 text-sm flex-1 min-w-0"
                  />

                  {/* Focus Type */}
                  <select
                    value={circuit.focusType}
                    onChange={(e) => updateCircuit(circuit.id, { focusType: e.target.value })}
                    className="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-1 min-w-0"
                  >
                    {CIRCUIT_FOCUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  {/* Exercise Count */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={circuit.exerciseCount}
                      onChange={(e) =>
                        updateCircuit(circuit.id, {
                          exerciseCount: Math.max(1, Math.min(12, Number(e.target.value))),
                        })
                      }
                      className="h-8 w-14 text-sm text-center"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">ex.</span>
                  </div>

                  {/* Remove */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeCircuit(circuit.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
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
