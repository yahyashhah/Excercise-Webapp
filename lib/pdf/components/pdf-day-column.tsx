import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PdfExerciseCard } from "./pdf-exercise-card";

const styles = StyleSheet.create({
  column: {
    flex: 1,
    padding: 8,
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
    borderRadius: 4,
  },
  dayHeader: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#3B82F6",
  },
});

const DAY_NAMES = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

interface ExerciseData {
  name: string;
  sets: number;
  reps?: number | null;
  durationSeconds?: number | null;
  restSeconds?: number | null;
  notes?: string | null;
  cuesThumbnail?: string | null;
  imageBuffer?: Buffer | null;
}

interface PdfDayColumnProps {
  dayNumber: number;
  exercises: ExerciseData[];
  placeholderBuffer: Buffer;
}

export function PdfDayColumn({
  dayNumber,
  exercises,
  placeholderBuffer,
}: PdfDayColumnProps) {
  const dayName = DAY_NAMES[dayNumber] || `Day ${dayNumber}`;

  return (
    <View style={styles.column}>
      <Text style={styles.dayHeader}>
        DAY {dayNumber} -- {dayName.toUpperCase()}
      </Text>
      {exercises.map((exercise, idx) => (
        <PdfExerciseCard
          key={idx}
          {...exercise}
          placeholderBuffer={placeholderBuffer}
        />
      ))}
    </View>
  );
}
