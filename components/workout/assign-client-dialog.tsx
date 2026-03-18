"use client";

import { useState } from "react";
import { toast } from "sonner";
import { UserPlus, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { assignClientToPlanAction } from "@/actions/workout-actions";

interface AssignClientDialogProps {
  planId: string;
  currentPatientId?: string | null;
  clients: { id: string; firstName: string; lastName: string; email: string }[];
}

export function AssignClientDialog({
  planId,
  currentPatientId,
  clients,
}: AssignClientDialogProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(currentPatientId ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    const result = await assignClientToPlanAction(planId, selected || null);
    setLoading(false);
    if (result.success) {
      toast.success(selected ? "Client assigned successfully" : "Client removed");
      setOpen(false);
    } else {
      toast.error(result.error ?? "Failed to assign client");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
        <UserPlus className="mr-1.5 h-4 w-4" />
        {currentPatientId ? "Change Client" : "Assign Client"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Client</DialogTitle>
          <DialogDescription>
            Attach this workout plan to a client. They will be able to view and complete it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Label>Select Client</Label>
          <select
            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">— No client (unassigned) —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName} ({c.email})
              </option>
            ))}
          </select>

          {currentPatientId && selected === currentPatientId && (
            <button
              type="button"
              onClick={() => setSelected("")}
              className="flex items-center gap-1.5 text-xs text-destructive hover:underline"
            >
              <X className="h-3 w-3" />
              Remove client from plan
            </button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
