import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E5E7EB",
    gap: 8,
  },
  thumbnail: {
    width: 50,
    height: 50,
    objectFit: "cover",
    borderRadius: 4,
  },
  content: {
    flex: 1,
    flexDirection: "column",
    gap: 2,
  },
  name: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#111827",
  },
  prescription: {
    fontSize: 9,
    color: "#374151",
  },
  cues: {
    fontSize: 8,
    color: "#6B7280",
    lineHeight: 1.3,
  },
});

interface PdfExerciseCardProps {
  name: string;
  sets: number;
  reps?: number | null;
  durationSeconds?: number | null;
  restSeconds?: number | null;
  notes?: string | null;
  cuesThumbnail?: string | null;
  imageBuffer?: Buffer | null;
  placeholderBuffer: Buffer;
}

export function PdfExerciseCard({
  name,
  sets,
  reps,
  durationSeconds,
  notes,
  cuesThumbnail,
  imageBuffer,
  placeholderBuffer,
}: PdfExerciseCardProps) {
  const prescription = reps
    ? `${sets} sets x ${reps} reps`
    : durationSeconds
      ? `${sets} sets x ${durationSeconds}s hold`
      : `${sets} sets`;

  const displayCues = notes || cuesThumbnail;

  const imgSrc = imageBuffer
    ? { data: imageBuffer, format: "png" as const }
    : { data: placeholderBuffer, format: "png" as const };

  return (
    <View style={styles.card}>
      <Image style={styles.thumbnail} src={imgSrc} />
      <View style={styles.content}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.prescription}>{prescription}</Text>
        {displayCues && (
          <Text style={styles.cues}>{displayCues}</Text>
        )}
      </View>
    </View>
  );
}
