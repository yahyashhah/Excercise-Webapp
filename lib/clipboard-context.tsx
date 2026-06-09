"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Scissors, X } from "lucide-react";
import type { WorkoutInput, WorkoutBlockInput, BlockExerciseInput } from "@/lib/validators/program";

export type ClipboardPayload =
  | { type: "workout";   data: WorkoutInput;        label: string }
  | { type: "block";     data: WorkoutBlockInput;    label: string }
  | { type: "exercises"; data: BlockExerciseInput[]; label: string };

interface ClipboardContextValue {
  clipboard: ClipboardPayload | null;
  copy: (payload: ClipboardPayload) => void;
  clear: () => void;
}

const ClipboardContext = createContext<ClipboardContextValue>({
  clipboard: null,
  copy: () => {},
  clear: () => {},
});

const STORAGE_KEY = "program-builder-clipboard";

export function stripIds<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripIds) as unknown as T;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k]) => k !== "id")
      .map(([k, v]) => [k, stripIds(v)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

export function ClipboardProvider({ children }: { children: React.ReactNode }) {
  const [clipboard, setClipboard] = useState<ClipboardPayload | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          parsed &&
          typeof parsed.label === "string" &&
          ["workout", "block", "exercises"].includes(parsed.type)
        ) {
          setClipboard(parsed);
        }
      }
    } catch {}
  }, []);

  const copy = useCallback((payload: ClipboardPayload) => {
    const safe: ClipboardPayload = { ...payload, data: stripIds(payload.data) } as ClipboardPayload;
    setClipboard(safe);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(safe)); } catch {}
  }, []);

  const clear = useCallback(() => {
    setClipboard(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  return (
    <ClipboardContext.Provider value={{ clipboard, copy, clear }}>
      {children}
      {clipboard && <ClipboardToast clipboard={clipboard} onClear={clear} />}
    </ClipboardContext.Provider>
  );
}

export function useClipboard() {
  return useContext(ClipboardContext);
}

function ClipboardToast({
  clipboard,
  onClear,
}: {
  clipboard: ClipboardPayload;
  onClear: () => void;
}) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-full text-sm shadow-lg animate-in slide-in-from-bottom-2 duration-200" role="status">
      <Scissors className="h-3.5 w-3.5 shrink-0" />
      <span className="max-w-[280px] truncate">
        {clipboard.label} copied — press paste to apply
      </span>
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded-full hover:bg-background/20 p-0.5 transition-colors"
        aria-label="Clear clipboard"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
