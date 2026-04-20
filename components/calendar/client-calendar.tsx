"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type View,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import {
  format,
  parse,
  startOfWeek,
  endOfWeek,
  getDay,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Plus, Dumbbell, ChevronLeft, ChevronRight } from "lucide-react";
import { rescheduleSessionAction } from "@/actions/session-actions";
import { createAdHocWorkout } from "@/actions/calendar-workout-actions";
import { WorkoutEditorPanel } from "@/components/calendar/workout-editor-panel";
import { AssignProgramDialog } from "@/components/calendar/assign-program-dialog";
import { useRouter } from "next/navigation";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ExerciseSummary = {
  id: string;
  name: string;
  bodyRegion: string;
  difficultyLevel: string;
  defaultReps?: number | null;
  musclesTargeted?: string[];
  imageUrl?: string | null;
};

type SessionSummary = {
  id: string;
  scheduledDate: Date | string;
  status: string;
  workout: {
    id: string;
    name: string;
    blocks: { exercises: { id: string }[] }[];
  };
};

interface SessionEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: string;
  exerciseCount: number;
  workoutName: string;
  resource: SessionSummary;
  allDay?: boolean;
}

type PanelState =
  | { mode: "closed" }
  | { mode: "creating"; date: Date }
  | { mode: "editing"; sessionId: string };

interface ClientCalendarProps {
  patientId: string;
  clinicianId: string;
  initialSessions: SessionSummary[];
  exerciseLibrary: ExerciseSummary[];
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
// DnD Calendar instance
// ---------------------------------------------------------------------------
const DnDCalendar = withDragAndDrop<SessionEvent>(Calendar);

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
          {event.workoutName}
        </p>
        <p className="mt-0.5 text-[10px] opacity-60">
          {event.exerciseCount} ex
        </p>
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
  onCreateClick,
}: {
  date: Date;
  view: View;
  onNavigate: (action: "PREV" | "NEXT" | "TODAY") => void;
  onView: (view: View) => void;
  onCreateClick: () => void;
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

      {/* Create workout */}
      <Button
        size="sm"
        className="h-8 gap-1.5 border-0 bg-linear-to-r from-blue-500 to-indigo-500 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-600"
        onClick={onCreateClick}
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Create Workout</span>
        <span className="sm:hidden">Create</span>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ClientCalendar({
  patientId,
  clinicianId,
  initialSessions,
  exerciseLibrary,
}: ClientCalendarProps) {
  const router = useRouter();
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [panelState, setPanelState] = useState<PanelState>({ mode: "closed" });

  // Build calendar events
  const events: SessionEvent[] = useMemo(
    () =>
      initialSessions.map((s) => {
        const exerciseCount = s.workout.blocks.reduce(
          (acc, b) => acc + b.exercises.length,
          0
        );
        const start = new Date(s.scheduledDate);
        return {
          id: s.id,
          title: s.workout.name,
          start,
          end: new Date(start.getTime() + 60 * 60 * 1000),
          status: s.status,
          exerciseCount,
          workoutName: s.workout.name,
          resource: s,
          allDay: true,
        };
      }),
    [initialSessions]
  );

  const handleSelectSlot = useCallback(
    ({ start }: { start: Date }) => setPanelState({ mode: "creating", date: start }),
    []
  );

  const handleSelectEvent = useCallback(
    (event: SessionEvent) => setPanelState({ mode: "editing", sessionId: event.id }),
    []
  );

  const handleEventDrop = useCallback(
    async ({ event, start }: { event: SessionEvent; start: string | Date }) => {
      const result = await rescheduleSessionAction(
        event.id,
        new Date(start).toISOString()
      );
      if (result.success) {
        toast.success("Session rescheduled");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    },
    [router]
  );

  const handlePanelClose = useCallback(() => setPanelState({ mode: "closed" }), []);
  const handleRefresh = useCallback(() => router.refresh(), [router]);
  const handleCreateClick = useCallback(
    () => setPanelState({ mode: "creating", date: new Date() }),
    []
  );

  return (
    <div className="space-y-4">
      {/* Top bar: legend + assign program */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Status legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {Object.entries(statusConfig).map(([key, c]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: c.border }}
              />
              <span className="text-xs text-muted-foreground">{c.label}</span>
            </div>
          ))}
        </div>

        <AssignProgramDialog patientId={patientId}>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 font-medium">
            <Dumbbell className="h-3.5 w-3.5" />
            Assign Program
          </Button>
        </AssignProgramDialog>
      </div>

      {/* Calendar */}
      <div className="min-h-160">
        <DnDCalendar
          localizer={localizer}
          events={events}
          view={view}
          date={date}
          onView={setView}
          onNavigate={setDate}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          onEventDrop={handleEventDrop as never}
          selectable
          resizable={false}
          draggableAccessor={() => true}
          popup
          style={{ height: 640 }}
          components={{
            event: EventComponent,
            toolbar: (props) => (
              <CustomToolbar
                date={props.date as Date}
                view={props.view as View}
                onNavigate={props.onNavigate}
                onView={props.onView}
                onCreateClick={handleCreateClick}
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
        />
      </div>

      {/* Workout editor side panel */}
      <WorkoutEditorPanel
        panelState={panelState}
        onClose={handlePanelClose}
        exerciseLibrary={exerciseLibrary}
        patientId={patientId}
        onWorkoutCreated={handleRefresh}
        onWorkoutDeleted={handleRefresh}
        onWorkoutUpdated={handleRefresh}
        createAdHocWorkoutAction={createAdHocWorkout}
      />
    </div>
  );
}
