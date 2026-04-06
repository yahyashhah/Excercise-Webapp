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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { assignProgramAction } from "@/actions/program-actions";
import { format } from "date-fns";

interface Props {
  programId: string;
  patients: { id: string; firstName: string; lastName: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignProgramDialog({
  programId,
  patients,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [patientId, setPatientId] = useState("");
  const [startDate, setStartDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [saving, setSaving] = useState(false);

  async function handleAssign() {
    if (!patientId) {
      toast.error("Select a client");
      return;
    }
    setSaving(true);
    try {
      const result = await assignProgramAction({
        programId,
        patientId,
        startDate: new Date(startDate).toISOString(),
      });
      if (result.success) {
        toast.success("Program assigned and sessions scheduled");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Program to Client</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={patientId} onValueChange={(v) => setPatientId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={saving}>
            {saving ? "Assigning..." : "Assign Program"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
