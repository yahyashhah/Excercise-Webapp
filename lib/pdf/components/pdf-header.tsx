import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    marginBottom: 15,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 60,
    height: 60,
    objectFit: "contain",
  },
  clinicInfo: {
    flexDirection: "column",
  },
  clinicName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111827",
  },
  tagline: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 2,
  },
  pageNumber: {
    fontSize: 9,
    color: "#9CA3AF",
  },
});

interface PdfHeaderProps {
  clinicName?: string;
  tagline?: string;
  logoBuffer?: Buffer | null;
  pageNumber: number;
}

export function PdfHeader({
  clinicName,
  tagline,
  logoBuffer,
  pageNumber,
}: PdfHeaderProps) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.leftSection}>
        {logoBuffer && (
          <Image
            style={styles.logo}
            src={{ data: logoBuffer, format: "png" }}
          />
        )}
        <View style={styles.clinicInfo}>
          {clinicName && <Text style={styles.clinicName}>{clinicName}</Text>}
          {tagline && <Text style={styles.tagline}>{tagline}</Text>}
        </View>
      </View>
      <Text style={styles.pageNumber}>Page {pageNumber}</Text>
    </View>
  );
}
