import { View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  footer: {
    marginTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
  },
  safetyText: {
    fontSize: 8,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 4,
  },
  scheduleText: {
    fontSize: 8,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 1.25,
  },
});

interface PdfFooterProps {
  description?: string | null;
}

export function PdfFooter({ description }: PdfFooterProps) {
  const safeDescription = description ? description.slice(0, 320) : null;

  return (
    <View style={styles.footer}>
      <Text style={styles.safetyText}>
        Keep pain &lt;= 3/10 &bull; Move slow &amp; controlled &bull; Breathe
        &bull; Stop if sharp pain
      </Text>
      {safeDescription && (
        <Text style={styles.scheduleText}>{safeDescription}</Text>
      )}
    </View>
  );
}
