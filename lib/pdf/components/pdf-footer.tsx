import { View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
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
  },
});

interface PdfFooterProps {
  description?: string | null;
}

export function PdfFooter({ description }: PdfFooterProps) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.safetyText}>
        Keep pain &lt;= 3/10 &bull; Move slow &amp; controlled &bull; Breathe
        &bull; Stop if sharp pain
      </Text>
      {description && (
        <Text style={styles.scheduleText}>{description}</Text>
      )}
    </View>
  );
}
