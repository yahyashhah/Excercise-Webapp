"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { updatePlanStatusAction } from "@/actions/workout-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckCircle, CirclePause, ChevronDown, Loader2, Archive, RotateCcw } from "lucide-react";

interface Props {
  planId: string;
  currentStatus: string;
}

const transitions: Record<string, { label: string; status: string; icon: React.ReactNode }[]> = {
  DRAFT: [
    { label: "Activate Plan", status: "ACTIVE", icon: <CheckCircle className="mr-2 h-4 w-4 text-green-600" /> },
  ],
  ACTIVE: [
    { label: "Pause Plan", status: "PAUSED", icon: <CirclePause className="mr-2 h-4 w-4 text-amber-600" /> },
    { label: "Mark Completed", status: "COMPLETED", icon: <CheckCircle className="mr-2 h-4 w-4 text-blue-600" /> },
  ],
  PAUSED: [
    { label: "Resume Plan", status: "ACTIVE", icon: <RotateCcw className="mr-2 h-4 w-4 text-green-600" /> },
    { label: "Archive Plan", status: "ARCHIVED", icon: <Archive className="mr-2 h-4 w-4 text-slate-500" /> },
  ],
  COMPLETED: [
    { label: "Archive Plan", status: "ARCHIVED", icon: <Archive className="mr-2 h-4 w-4 text-slate-500" /> },
  ],
  ARCHIVED: [],
};

export function PlanStatusActions({ planId, currentStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const options = transitions[currentStatus] ?? [];

  if (options.length === 0) return null;

  async function handleChange(status: string) {
    setLoading(true);
    const result = await updatePlanStatusAction(planId, status);
    setLoading(false);
    if (result.success) {
      toast.success(`Plan status updated to ${status.toLowerCase()}`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to update status");
    }
  }

  // Single action — just a button, no dropdown needed
  if (options.length === 1) {
    return (
      <Button
        size="sm"
        variant={currentStatus === "DRAFT" ? "default" : "outline"}
        onClick={() => handleChange(options[0].status)}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          options[0].icon
        )}
        {options[0].label}
      </Button>
    );
  }

  // Multiple actions — dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={loading} />}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Change Status
        <ChevronDown className="ml-1 h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((opt) => (
          <DropdownMenuItem key={opt.status} onClick={() => handleChange(opt.status)}>
            {opt.icon}
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
