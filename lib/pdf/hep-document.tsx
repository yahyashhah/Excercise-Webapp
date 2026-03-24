import { Document, Page, View, StyleSheet } from "@react-pdf/renderer";
import { PdfHeader } from "./components/pdf-header";
import { PdfPlanInfo } from "./components/pdf-plan-info";
import { PdfDayColumn } from "./components/pdf-day-column";
import { PdfFooter } from "./components/pdf-footer";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 60,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  dayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
});

interface PlanExerciseData {
  exerciseId: string;
  name: string;
  sets: number;
  reps?: number | null;
  durationSeconds?: number | null;
  restSeconds?: number | null;
  notes?: string | null;
  cuesThumbnail?: string | null;
  dayOfWeek: number;
}

interface HEPDocumentProps {
  planTitle: string;
  planDescription?: string | null;
  clientName?: string;
  createdDate: string;
  daysPerWeek?: number | null;
  durationMinutes?: number | null;
  clinicName?: string;
  clinicTagline?: string;
  clinicLogoBuffer?: Buffer | null;
  exercisesByDay: Map<number, PlanExerciseData[]>;
  imageMap: Map<string, Buffer>;
  placeholderBuffer: Buffer;
}

export function HEPDocument({
  planTitle,
  planDescription,
  clientName,
  createdDate,
  daysPerWeek,
  durationMinutes,
  clinicName,
  clinicTagline,
  clinicLogoBuffer,
  exercisesByDay,
  imageMap,
  placeholderBuffer,
}: HEPDocumentProps) {
  const days = Array.from(exercisesByDay.entries()).sort(
    ([a], [b]) => a - b
  );
  const numDays = days.length;

  // Calculate column width percentages
  // 1-2 days: 2 columns, 3+ days: 3 columns flowing to rows
  const columnsPerRow = numDays <= 2 ? 2 : 3;
  const columnWidthPercent = `${Math.floor(100 / columnsPerRow) - 2}%`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PdfHeader
          clinicName={clinicName}
          tagline={clinicTagline}
          logoBuffer={clinicLogoBuffer}
          pageNumber={1}
        />
        <PdfPlanInfo
          title={planTitle}
          clientName={clientName}
          createdDate={createdDate}
          daysPerWeek={daysPerWeek}
          durationMinutes={durationMinutes}
        />
        <View style={styles.dayGrid}>
          {days.map(([dayNum, exercises]) => (
            <View
              key={dayNum}
              style={{ width: columnWidthPercent } as Record<string, string>}
            >
              <PdfDayColumn
                dayNumber={dayNum}
                exercises={exercises.map((ex) => ({
                  name: ex.name,
                  sets: ex.sets,
                  reps: ex.reps,
                  durationSeconds: ex.durationSeconds,
                  restSeconds: ex.restSeconds,
                  notes: ex.notes,
                  cuesThumbnail: ex.cuesThumbnail,
                  imageBuffer: imageMap.get(ex.exerciseId) ?? null,
                }))}
                placeholderBuffer={placeholderBuffer}
              />
            </View>
          ))}
        </View>
        <PdfFooter description={planDescription} />
      </Page>
    </Document>
  );
}
