"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createAssessmentAction } from "@/actions/assessment-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ASSESSMENT_TYPES } from "@/lib/utils/constants";
import { Loader2 } from "lucide-react";

interface Props {
  role: string;
  selfPatientId?: string;
  patients: { id: string; firstName: string; lastName: string }[];
}

export function NewAssessmentForm({ role, selfPatientId, patients }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [patientId, setPatientId] = useState(selfPatientId ?? "");
  const [assessmentType, setAssessmentType] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");

  const selectedType = ASSESSMENT_TYPES.find((t) => t.value === assessmentType);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (role === "CLINICIAN" && !patientId) {
      toast.error("Please select a patient");
      return;
    }
    if (!assessmentType) {
      toast.error("Please select an assessment type");
      return;
    }
    if (!value) {
      toast.error("Please enter a value");
      return;
    }

    setLoading(true);
    const result = await createAssessmentAction({
      patientId: role === "PATIENT" ? undefined : patientId,
      assessmentType,
      value: parseFloat(value),
      unit: selectedType?.unit ?? "",
      notes: notes || undefined,
    });
    setLoading(false);

    if (result.success) {
      toast.success("Assessment recorded successfully");
      router.push("/assessments");
    } else {
      toast.error(result.error ?? "Failed to record assessment");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Record Assessment</CardTitle>
          <CardDescription>
            {role === "PATIENT"
              ? "Track your own measurements and outcomes."
              : "Record a clinical measurement for one of your patients."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Patient selector — clinicians only */}
          {role === "CLINICIAN" && (
            <div className="space-y-2">
              <Label>
                Patient <span className="text-destructive">*</span>
              </Label>
              {patients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No linked patients. Add patients from the Patients page first.
                </p>
              ) : (
                <select
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  required
                >
                  <option value="">Select a patient</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Assessment type */}
          <div className="space-y-2">
            <Label>
              Assessment Type <span className="text-destructive">*</span>
            </Label>
            <select
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={assessmentType}
              onChange={(e) => setAssessmentType(e.target.value)}
              required
            >
              <option value="">Select type</option>
              {ASSESSMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Value + unit */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Value <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter measurement"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Input
                value={selectedType?.unit ?? "—"}
                readOnly
                className="bg-muted text-muted-foreground"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any additional observations..."
            />
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Record Assessment
        </Button>
      </div>
    </form>
  );
}
