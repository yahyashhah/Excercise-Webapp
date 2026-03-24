import { View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 15,
    marginBottom: 15,
    padding: 10,
    backgroundColor: "#F9FAFB",
    borderRadius: 4,
  },
  item: {
    flexDirection: "column",
  },
  label: {
    fontSize: 8,
    color: "#6B7280",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  value: {
    fontSize: 10,
    color: "#111827",
    fontWeight: "bold",
  },
});

interface PdfPlanInfoProps {
  title: string;
  clientName?: string;
  createdDate: string;
  daysPerWeek?: number | null;
  durationMinutes?: number | null;
}

export function PdfPlanInfo({
  title,
  clientName,
  createdDate,
  daysPerWeek,
  durationMinutes,
}: PdfPlanInfoProps) {
  return (
    <View style={styles.container}>
      <View style={styles.item}>
        <Text style={styles.label}>Program</Text>
        <Text style={styles.value}>{title}</Text>
      </View>
      {clientName && (
        <View style={styles.item}>
          <Text style={styles.label}>Client</Text>
          <Text style={styles.value}>{clientName}</Text>
        </View>
      )}
      <View style={styles.item}>
        <Text style={styles.label}>Created</Text>
        <Text style={styles.value}>{createdDate}</Text>
      </View>
      {daysPerWeek && (
        <View style={styles.item}>
          <Text style={styles.label}>Schedule</Text>
          <Text style={styles.value}>
            {daysPerWeek}x/week
            {durationMinutes ? ` | ~${durationMinutes} min/session` : ""}
          </Text>
        </View>
      )}
    </View>
  );
}
