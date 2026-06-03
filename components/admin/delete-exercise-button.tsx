"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteExerciseAction } from "@/actions/exercise-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function DeleteExerciseButton({ exerciseId, exerciseName }: { exerciseId: string; exerciseName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      // Auto-reset after 3 seconds if user doesn't confirm
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    startTransition(async () => {
      const result = await deleteExerciseAction(exerciseId);
      if (result.success) {
        toast.success(`"${exerciseName}" deleted`);
        router.refresh();
      } else {
        toast.error(result.error);
        setConfirming(false);
      }
    });
  }

  if (confirming) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        Confirm?
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
    >
      <Trash2 className="h-3 w-3" />
      Delete
    </button>
  );
}
