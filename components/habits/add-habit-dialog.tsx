"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createHabitAction } from "@/actions/habit-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ─── Constants ────────────────────────────────────────────────────────────────

const ICON_OPTIONS = ["💧", "🏃‍♂️", "😴", "🧘‍♂️", "🥗", "💊", "📖", "🚶"];

const FREQUENCY_OPTIONS = [
  { value: "DAILY",  label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Patient {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface AddHabitDialogProps {
  /** Clinician's linked patients — only passed when user is a CLINICIAN. */
  patients?: Patient[];
  /** Pre-selected patient id (e.g. when triggered from a patient's profile page). */
  defaultPatientId?: string;
  /** Override the trigger label/icon. */
  triggerLabel?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddHabitDialog({
  patients,
  defaultPatientId,
  triggerLabel = "Add Habit",
}: AddHabitDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [name, setName]               = useState("");
  const [icon, setIcon]               = useState(ICON_OPTIONS[0]);
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit]               = useState("");
  const [frequency, setFrequency]     = useState<"DAILY" | "WEEKLY">("DAILY");
  const [patientId, setPatientId]     = useState(defaultPatientId ?? "");

  const isClinician = Array.isArray(patients);

  function resetForm() {
    setName("");
    setIcon(ICON_OPTIONS[0]);
    setTargetValue("");
    setUnit("");
    setFrequency("DAILY");
    setPatientId(defaultPatientId ?? "");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Please enter a habit name");
      return;
    }

    if (isClinician && !patientId) {
      toast.error("Please select a patient");
      return;
    }

    startTransition(async () => {
      const result = await createHabitAction({
        name: name.trim(),
        icon,
        targetValue: targetValue ? parseFloat(targetValue) : undefined,
        unit: unit.trim() || undefined,
        frequency,
        patientId: isClinician ? patientId : undefined,
      });

      if (result.success) {
        toast.success("Habit created successfully");
        setOpen(false);
        resetForm();
      } else {
        toast.error(result.error ?? "Failed to create habit");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* base-ui DialogTrigger does not accept asChild — apply button styling directly */}
      <DialogTrigger className="inline-flex items-center justify-center gap-2 rounded-lg bg-linear-to-r from-violet-500 to-purple-600 border-0 px-3 py-2 text-sm font-semibold text-white shadow-md shadow-violet-500/20 transition-all hover:from-violet-600 hover:to-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Plus className="h-4 w-4" />
        {triggerLabel}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add a Habit</DialogTitle>
            <DialogDescription>
              Build a healthy routine by tracking daily or weekly habits.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-5">
            {/* Patient selector — clinician only */}
            {isClinician && (
              <div className="space-y-2">
                <Label htmlFor="habit-patient">Patient</Label>
                <select
                  id="habit-patient"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  required
                  disabled={isPending}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select a patient…</option>
                  {patients!.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Habit name */}
            <div className="space-y-2">
              <Label htmlFor="habit-name">Habit name</Label>
              <Input
                id="habit-name"
                placeholder="e.g. Drink 8 glasses of water"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus={!isClinician}
                disabled={isPending}
                maxLength={80}
              />
            </div>

            {/* Icon picker */}
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {ICON_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setIcon(emoji)}
                    disabled={isPending}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg text-xl transition-all",
                      icon === emoji
                        ? "ring-2 ring-primary bg-primary/10"
                        : "ring-1 ring-border/50 hover:ring-border"
                    )}
                    aria-label={`Select icon ${emoji}`}
                    aria-pressed={icon === emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Target value + unit (optional) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="habit-target">Target (optional)</Label>
                <Input
                  id="habit-target"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="e.g. 8"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="habit-unit">Unit (optional)</Label>
                <Input
                  id="habit-unit"
                  placeholder="e.g. glasses"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  disabled={isPending}
                  maxLength={20}
                />
              </div>
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label>Frequency</Label>
              <div className="flex gap-2">
                {FREQUENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFrequency(opt.value as "DAILY" | "WEEKLY")}
                    disabled={isPending}
                    className={cn(
                      "flex-1 rounded-lg py-2 text-sm font-medium transition-all",
                      frequency === opt.value
                        ? "bg-primary text-primary-foreground"
                        : "ring-1 ring-border/50 hover:ring-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !name.trim() || (isClinician && !patientId)}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Habit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
