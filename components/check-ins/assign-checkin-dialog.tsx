"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { assignCheckInAction } from "@/actions/checkin-actions";
import { UserPlus } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
}

interface Props {
  templateId: string;
  templateName: string;
  patients: Patient[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssignCheckInDialog({
  templateId,
  templateName,
  patients,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [assigning, setAssigning] = useState(false);

  async function handleAssign() {
    if (!patientId) {
      toast.error("Please select a patient");
      return;
    }

    setAssigning(true);
    try {
      const result = await assignCheckInAction(templateId, patientId);
      if (result.success) {
        toast.success("Check-in assigned successfully");
        setOpen(false);
        setPatientId("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setAssigning(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-2 w-full"
      >
        <UserPlus className="h-4 w-4" />
        Assign to Patient
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Check-in to Patient</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/40 border border-border/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">Template</p>
              <p className="mt-0.5 font-semibold">{templateName}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="patient-select">Select Patient</Label>
              {patients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No patients linked to your account yet.
                </p>
              ) : (
                <Select
                  value={patientId}
                  onValueChange={(v) => setPatientId(v ?? "")}
                >
                  <SelectTrigger id="patient-select">
                    <SelectValue placeholder="Choose a patient..." />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setPatientId("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={assigning || !patientId || patients.length === 0}
              className="gap-2 bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-600"
            >
              <UserPlus className="h-4 w-4" />
              {assigning ? "Assigning..." : "Assign Check-in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
