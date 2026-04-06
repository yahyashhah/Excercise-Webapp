"use client";

import { useState, useCallback } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  View,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import {
  format,
  parse,
  startOfWeek,
  getDay,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import { rescheduleSessionAction } from "@/actions/session-actions";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-US": enUS },
});

const DnDCalendar = withDragAndDrop<SessionEvent>(Calendar);

interface SessionEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: string;
  patientName?: string;
  programName?: string;
  resource: Record<string, unknown>;
}

interface Props {
  sessions: Record<string, unknown>[];
  isClinician: boolean;
  onSessionClick?: (sessionId: string) => void;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  SCHEDULED: { bg: "hsl(217, 91%, 60%)", text: "#fff" },
  IN_PROGRESS: { bg: "#f59e0b", text: "#fff" },
  COMPLETED: { bg: "#22c55e", text: "#fff" },
  MISSED: { bg: "#ef4444", text: "#fff" },
  SKIPPED: { bg: "#6b7280", text: "#fff" },
};

export function CalendarWithSidebar({
  sessions,
  isClinician,
  onSessionClick,
}: Props) {
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());

  const events: SessionEvent[] = sessions.map(
    (s: Record<string, unknown>) => {
      const workout = s.workout as Record<string, unknown> | undefined;
      const program = workout?.program as
        | Record<string, unknown>
        | undefined;
      const patient = s.patient as Record<string, unknown> | undefined;
      return {
        id: s.id as string,
        title: (program?.name as string) || "Workout",
        start: new Date(s.scheduledDate as string),
        end: new Date(
          new Date(s.scheduledDate as string).getTime() + 60 * 60 * 1000
        ),
        status: s.status as string,
        patientName: patient
          ? `${patient.firstName} ${patient.lastName}`
          : undefined,
        programName: program?.name as string | undefined,
        resource: s,
      };
    }
  );

  const handleEventDrop = useCallback(
    async ({ event, start }: { event: SessionEvent; start: string | Date }) => {
      if (!isClinician) {
        toast.error("Only coaches can reschedule sessions");
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
    <div className="h-[650px] w-full rounded-md border p-4 bg-card">
      {/* Legend */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {Object.entries(statusColors).map(([status, colors]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colors.bg }}
            />
            <span className="text-xs text-muted-foreground">{status}</span>
          </div>
        ))}
      </div>

      <DnDCalendar
        localizer={localizer}
        events={events}
        view={view}
        date={date}
        onView={setView}
        onNavigate={setDate}
        onEventDrop={handleEventDrop as never}
        onSelectEvent={(event: SessionEvent) =>
          onSessionClick?.(event.id)
        }
        resizable={false}
        draggableAccessor={() => isClinician}
        style={{ height: "calc(100% - 40px)" }}
        eventPropGetter={(event: SessionEvent) => {
          const colors =
            statusColors[event.status] || statusColors.SCHEDULED;
          return {
            style: {
              backgroundColor: colors.bg,
              color: colors.text,
              borderRadius: "4px",
              border: "none",
              fontSize: "0.75rem",
            },
          };
        }}
        tooltipAccessor={(event: SessionEvent) => {
          let tip = event.title;
          if (event.patientName) tip += ` | ${event.patientName}`;
          tip += ` | ${event.status}`;
          return tip;
        }}
      />
    </div>
  );
}
