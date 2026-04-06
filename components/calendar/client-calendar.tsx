"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type View,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Dumbbell, ChevronLeft, ChevronRight } from "lucide-react";
import { rescheduleSessionAction } from "@/actions/session-actions";
import { createAdHocWorkout } from "@/actions/calendar-workout-actions";
import { WorkoutEditorPanel } from "@/components/calendar/workout-editor-panel";
import { AssignProgramDialog } from "@/components/calendar/assign-program-dialog";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Calendar setup
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
    blocks: {
      exercises: { id: string }[];
    }[];
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
// Status colors
// ---------------------------------------------------------------------------

const statusColors: Record<string, { bg: string; border: string; text: string }> = {
  SCHEDULED: { bg: "#eff6ff", border: "#3b82f6", text: "#1e40af" },
  IN_PROGRESS: { bg: "#fffbeb", border: "#f59e0b", text: "#92400e" },
  COMPLETED: { bg: "#f0fdf4", border: "#22c55e", text: "#166534" },
  MISSED: { bg: "#fef2f2", border: "#ef4444", text: "#991b1b" },
  SKIPPED: { bg: "#f9fafb", border: "#6b7280", text: "#374151" },
};

// ---------------------------------------------------------------------------
// Create DnD calendar
// ---------------------------------------------------------------------------

const DnDCalendar = withDragAndDrop<SessionEvent>(Calendar);

// ---------------------------------------------------------------------------
// Custom event component
// ---------------------------------------------------------------------------

function EventComponent({ event }: { event: SessionEvent }) {
  const colors = statusColors[event.status] || statusColors.SCHEDULED;
  return (
    <div
      className="px-1.5 py-0.5 rounded text-xs leading-tight overflow-hidden cursor-pointer"
      style={{
        backgroundColor: colors.bg,
        borderLeft: `3px solid ${colors.border}`,
        color: colors.text,
      }}
    >
      <div className="font-medium truncate">{event.workoutName}</div>
      <div className="text-[10px] opacity-75">
        {event.exerciseCount} exercise{event.exerciseCount !== 1 ? "s" : ""}
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
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className="flex items-center border rounded-md overflow-hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onNavigate("PREV")}
            className="rounded-none border-r"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate("TODAY")}
            className="rounded-none px-3 text-xs"
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onNavigate("NEXT")}
            className="rounded-none border-l"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="text-lg font-semibold ml-2">
          {format(date, "MMMM yyyy")}
        </h2>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center border rounded-md overflow-hidden">
          <Button
            variant={view === Views.WEEK ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onView(Views.WEEK)}
            className="rounded-none text-xs"
          >
            Week
          </Button>
          <Button
            variant={view === Views.MONTH ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onView(Views.MONTH)}
            className="rounded-none border-l text-xs"
          >
            Month
          </Button>
        </div>
        <Button size="sm" onClick={onCreateClick}>
          <Plus className="h-4 w-4 mr-1" />
          Create Workout
        </Button>
      </div>
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

  // Convert sessions to calendar events
  const events: SessionEvent[] = useMemo(() => {
    return initialSessions.map((s) => {
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
    });
  }, [initialSessions]);

  // Click empty date slot
  const handleSelectSlot = useCallback(
    ({ start }: { start: Date }) => {
      setPanelState({ mode: "creating", date: start });
    },
    []
  );

  // Click existing event
  const handleSelectEvent = useCallback((event: SessionEvent) => {
    setPanelState({ mode: "editing", sessionId: event.id });
  }, []);

  // Drag and drop to reschedule
  const handleEventDrop = useCallback(
    async ({
      event,
      start,
    }: {
      event: SessionEvent;
      start: string | Date;
    }) => {
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

  // Panel close
  const handlePanelClose = useCallback(() => {
    setPanelState({ mode: "closed" });
  }, []);

  // Refresh after mutations
  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  // Create workout for today (toolbar button)
  const handleCreateClick = useCallback(() => {
    setPanelState({ mode: "creating", date: new Date() });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Status legend and Actions */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-4">
        <div className="flex gap-3 flex-wrap">
          {Object.entries(statusColors).map(([status, colors]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: colors.border }}
              />
              <span className="text-xs text-muted-foreground capitalize">
                {status.toLowerCase().replace("_", " ")}
              </span>
            </div>
          ))}
        </div>

        <AssignProgramDialog patientId={patientId}>
          <Button variant="default" size="sm">
            <Dumbbell className="h-4 w-4 mr-2" />
            Assign Program
          </Button>
        </AssignProgramDialog>
      </div>

      {/* Calendar */}
      <div className="flex-1 min-h-[600px] bg-card rounded-lg border p-4">
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
          style={{ height: 600 }}
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
          eventPropGetter={(event: SessionEvent) => {
            return {
              style: {
                padding: 0,
                backgroundColor: "transparent",
                border: "none",
                borderRadius: "4px",
              },
            };
          }}
        />
      </div>

      {/* Workout editor panel */}
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
