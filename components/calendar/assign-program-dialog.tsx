"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getProgramsAction } from "@/actions/program-actions";
import { scheduleProgramForPatientAction } from "@/actions/calendar-actions";

export function AssignProgramDialog({
  patientId,
  children,
  onSuccess,
}: {
  patientId: string;
  children: React.ReactNode;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && programs.length === 0) {
      getProgramsAction({ isTemplate: true })
        .then((res) => {
          if (res.success && res.data) {
            setPrograms(res.data.map(p => ({ id: p.id, name: p.name })));
          }
        })
        .catch(console.error);
    }
  }, [open, programs.length]);

  const handleAssign = async () => {
    if (!selectedProgramId) {
      toast.error("Please select a program.");
      return;
    }
    if (!startDate) {
      toast.error("Please select a start date.");
      return;
    }

    setLoading(true);
    try {
      const res = await scheduleProgramForPatientAction({
        programId: selectedProgramId,
        patientId,
        startDate,
      });

      if (res.success) {
        toast.success("Program scheduled successfully");
        setOpen(false);
        if (onSuccess) onSuccess();
      } else {
        toast.error(res.error || "Failed to schedule program");
      }
    } catch (error) {
      toast.error("An error occurred while scheduling.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={React.isValidElement(children) ? children : <button>{children}</button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Program</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Template</Label>
            <Select value={selectedProgramId} onValueChange={(val) => setSelectedProgramId(val || "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select a program" />
              </SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
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
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={loading}>
            {loading ? "Assigning..." : "Assign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}