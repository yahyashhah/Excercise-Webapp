"use client";

import { useState, useTransition } from "react";
import { linkPatientAction } from "@/actions/patient-actions";
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
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

export function AddPatientDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Please enter a patient email address");
      return;
    }

    startTransition(async () => {
      const result = await linkPatientAction(trimmed);

      if (result.success) {
        toast.success("Patient linked successfully");
        setEmail("");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Failed to link patient");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all outline-none select-none hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 h-8"
      >
        <UserPlus className="h-4 w-4" />
        Add Patient
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add a Patient</DialogTitle>
            <DialogDescription>
              Enter the email address of a patient who has already signed up.
              This will link them to your account so you can manage their
              exercise programs.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="patient-email">Patient Email</Label>
              <Input
                id="patient-email"
                type="email"
                placeholder="patient@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={isPending}
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="submit"
              disabled={isPending || !email.trim()}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Link Patient
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
