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
import { toast } from "sonner";
import { assignGlobalProgramOrganizationsAction } from "@/actions/global-program-actions";
import { ClinicVisibilitySelector } from "@/components/programs/clinic-visibility-selector";

interface Props {
  programId: string;
  clinics: { id: string; name: string }[];
  currentOrganizationIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignClinicsDialog({
  programId,
  clinics,
  currentOrganizationIds,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(currentOrganizationIds);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await assignGlobalProgramOrganizationsAction(programId, selected);
      if (result.success) {
        toast.success(
          selected.length === 0
            ? "Program is now available to all clinics"
            : `Program assigned to ${selected.length} clinic${selected.length === 1 ? "" : "s"}`
        );
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
          <DialogTitle>Assign to Clinics</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <ClinicVisibilitySelector
            clinics={clinics}
            value={selected}
            onChange={setSelected}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
