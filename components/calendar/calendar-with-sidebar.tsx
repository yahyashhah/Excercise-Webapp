"use client";

import { useState, useCallback } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type View,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import {
  format,
  parse,
  startOfWeek,
  endOfWeek,
  getDay,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import { rescheduleSessionAction } from "@/actions/session-actions";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Localizer
// ---------------------------------------------------------------------------
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-US": enUS },
});

const DnDCalendar = withDragAndDrop<SessionEvent>(Calendar);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SessionEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: string;
  patientName?: string;
  programName?: string;
  exerciseCount?: number;
  resource: Record<string, unknown>;
}

interface Props {
  sessions: Record<string, unknown>[];
  isClinician: boolean;
  onSessionClick?: (sessionId: string) => void;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------
const statusConfig: Record<
  string,
  { bg: string; border: string; text: string; label: string }
> = {
  SCHEDULED:   { bg: "#eff6ff", border: "#3b82f6", text: "#1e3a8a", label: "Scheduled"   },
  IN_PROGRESS: { bg: "#fffbeb", border: "#f59e0b", text: "#78350f", label: "In Progress" },
  COMPLETED:   { bg: "#f0fdf4", border: "#22c55e", text: "#14532d", label: "Completed"   },
  MISSED:      { bg: "#fef2f2", border: "#ef4444", text: "#7f1d1d", label: "Missed"      },
  SKIPPED:     { bg: "#f9fafb", border: "#94a3b8", text: "#334155", label: "Skipped"     },
};

// ---------------------------------------------------------------------------
// Event pill component
// ---------------------------------------------------------------------------
function EventComponent({ event }: { event: SessionEvent }) {
  const c = statusConfig[event.status] ?? statusConfig.SCHEDULED;
  return (
    <div
      className="h-full overflow-hidden rounded-[5px] transition-opacity hover:opacity-90"
      style={{
        backgroundColor: c.bg,
        borderLeft: `3px solid ${c.border}`,
        color: c.text,
      }}
    >
      <div className="px-2 py-1">
        <p className="truncate text-[11px] font-semibold leading-tight">
          {event.title}
        </p>
        {event.programName && (
          <p className="mt-0.5 truncate text-[10px] opacity-60">
            {event.programName}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom toolbar
// ---------------------------------------------------------------------------
function CustomToolbar({
  date,
  view,
  onNavigate,
  onView,
}: {
  date: Date;
  view: View;
  onNavigate: (action: "PREV" | "NEXT" | "TODAY") => void;
  onView: (view: View) => void;
}) {
  const title =
    view === Views.WEEK
      ? `${format(startOfWeek(date), "MMM d")} – ${format(endOfWeek(date), "MMM d, yyyy")}`
      : format(date, "MMMM yyyy");

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      {/* Navigation */}
      <div className="flex items-center overflow-hidden rounded-lg border border-border bg-muted/40">
        <button
          onClick={() => onNavigate("PREV")}
          className="flex h-8 w-8 items-center justify-center border-r border-border text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onNavigate("TODAY")}
          className="h-8 px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
        >
          Today
        </button>
        <button
          onClick={() => onNavigate("NEXT")}
          className="flex h-8 w-8 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Title */}
      <h2 className="flex-1 text-base font-bold tracking-tight sm:text-lg">
        {title}
      </h2>

      {/* View toggle */}
      <div className="flex items-center overflow-hidden rounded-lg border border-border bg-muted/40 p-0.5">
        {([Views.MONTH, Views.WEEK] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => onView(v)}
            className={cn(
              "h-7 rounded-md px-3 text-xs font-medium transition-all",
              view === v
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {v === Views.MONTH ? "Month" : "Week"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function CalendarWithSidebar({ sessions, isClinician, onSessionClick }: Props) {
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());

  const events: SessionEvent[] = sessions.map((s) => {
    const workout = s.workout as Record<string, unknown> | undefined;
    const program = workout?.program as Record<string, unknown> | undefined;
    const patient = s.patient as Record<string, unknown> | undefined;
    const blocks = (workout?.blocks as Record<string, unknown>[] | undefined) ?? [];
    const exerciseCount = blocks.reduce((acc, b) => {
      const exs = b.exercises as unknown[] | undefined;
      return acc + (exs?.length ?? 0);
    }, 0);

    return {
      id: s.id as string,
      title: (workout?.name as string) || (program?.name as string) || "Workout",
      start: new Date(s.scheduledDate as string),
      end: new Date(new Date(s.scheduledDate as string).getTime() + 60 * 60 * 1000),
      status: s.status as string,
      patientName: patient
        ? `${patient.firstName} ${patient.lastName}`
        : undefined,
      programName: program?.name as string | undefined,
      exerciseCount,
      resource: s,
    };
  });

  const handleEventDrop = useCallback(
    async ({ event, start }: { event: SessionEvent; start: string | Date }) => {
      if (!isClinician) {
        toast.error("Only clinicians can reschedule sessions");
        return;
      }
      const result = await rescheduleSessionAction(
        event.id,
        new Date(start).toISOString()
      );
      if (result.success) {
        toast.success("Session rescheduled");
      } else {
        toast.error(result.error);
      }
    },
    [isClinician]
  );

  return (
    <div className="space-y-4">
      {/* Status legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {Object.entries(statusConfig).map(([key, c]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: c.border }}
            />
            <span className="text-xs text-muted-foreground">{c.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="min-h-155">
        <DnDCalendar
          localizer={localizer}
          events={events}
          view={view}
          date={date}
          onView={setView}
          onNavigate={setDate}
          onEventDrop={handleEventDrop as never}
          onSelectEvent={(event: SessionEvent) => onSessionClick?.(event.id)}
          resizable={false}
          draggableAccessor={() => isClinician}
          popup
          style={{ height: 620 }}
          components={{
            event: EventComponent,
            toolbar: (props) => (
              <CustomToolbar
                date={props.date as Date}
                view={props.view as View}
                onNavigate={props.onNavigate}
                onView={props.onView}
              />
            ),
          }}
          eventPropGetter={() => ({
            style: {
              padding: 0,
              backgroundColor: "transparent",
              border: "none",
              borderRadius: "5px",
            },
          })}
          tooltipAccessor={(event: SessionEvent) => {
            let tip = event.title;
            if (event.programName) tip += ` · ${event.programName}`;
            if (event.patientName) tip += ` · ${event.patientName}`;
            return `${tip} · ${statusConfig[event.status]?.label ?? event.status}`;
          }}
        />
      </div>
    </div>
  );
}
