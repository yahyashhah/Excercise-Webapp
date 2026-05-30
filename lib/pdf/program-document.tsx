import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

// ─── Data transformer (pure, testable) ──────────────────────────────────────

export interface PdfExercise {
  name: string
  setsSummary: string
  equipment: string
  notes: string | null
}

export interface PdfSection {
  workoutName: string
  estimatedMinutes: number | null
  exercises: PdfExercise[]
}

function formatSets(sets: Record<string, unknown>[]): string {
  if (sets.length === 0) return ''
  const first = sets[0]
  const reps = first.targetReps ? `${first.targetReps} reps` : ''
  const weight = first.targetWeight ? ` @ ${first.targetWeight}lb` : ''
  const dur = first.targetDuration ? ` ${first.targetDuration}s` : ''
  const detail = `${reps}${weight}${dur}`.trim()
  return sets.length > 1 ? `${sets.length} × ${detail}` : detail
}

export function buildProgramPdfSections(
  workouts: Record<string, unknown>[]
): PdfSection[] {
  return workouts.map((w) => {
    const blocks = (w.blocks as Record<string, unknown>[]) ?? []
    const exercises: PdfExercise[] = blocks
      .flatMap((b) => (b.exercises as Record<string, unknown>[]) ?? [])
      .map((be) => {
        const ex = be.exercise as Record<string, unknown>
        const sets = (be.sets as Record<string, unknown>[]) ?? []
        const eq = (ex.equipmentRequired as string[]) ?? []
        const equipment = eq.filter((e) => e.toLowerCase() !== 'none').join(', ') || 'Bodyweight'
        return {
          name: ex.name as string,
          setsSummary: formatSets(sets),
          equipment,
          notes: (be.notes as string | null) ?? null,
        }
      })
    return {
      workoutName: w.name as string,
      estimatedMinutes: (w.estimatedMinutes as number | null) ?? null,
      exercises,
    }
  })
}

// ─── React-PDF component ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 11, color: '#111827' },
  header: { marginBottom: 24 },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#1d4ed8', marginBottom: 4 },
  subtitle: { fontSize: 11, color: '#6b7280' },
  workoutSection: { marginBottom: 20 },
  workoutHeader: {
    backgroundColor: '#eff6ff',
    padding: '8 12',
    borderRadius: 4,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  workoutName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#1e40af' },
  workoutMeta: { fontSize: 10, color: '#6b7280' },
  exerciseRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    alignItems: 'flex-start',
  },
  exerciseName: { fontFamily: 'Helvetica-Bold', flex: 2 },
  exerciseSets: { flex: 1, color: '#374151' },
  exerciseEquip: { flex: 1.5, color: '#6b7280', fontSize: 10 },
  exerciseNotes: { fontSize: 9, color: '#9ca3af', marginTop: 2 },
  columnHeader: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 2,
  },
  columnHeaderText: { fontSize: 9, color: '#9ca3af', fontFamily: 'Helvetica-Bold' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 9,
    color: '#d1d5db',
  },
})

interface ProgramDocumentProps {
  programName: string
  patientName: string | null
  clinicName: string
  sections: PdfSection[]
}

export function ProgramDocument({
  programName,
  patientName,
  clinicName,
  sections,
}: ProgramDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{programName}</Text>
          {patientName && <Text style={styles.subtitle}>Patient: {patientName}</Text>}
          <Text style={styles.subtitle}>{clinicName}</Text>
        </View>

        {sections.map((section, si) => (
          <View key={si} style={styles.workoutSection} wrap={false}>
            <View style={styles.workoutHeader}>
              <Text style={styles.workoutName}>{section.workoutName}</Text>
              {section.estimatedMinutes && (
                <Text style={styles.workoutMeta}>~{section.estimatedMinutes} min</Text>
              )}
            </View>
            <View style={styles.columnHeader}>
              <Text style={[styles.columnHeaderText, { flex: 2 }]}>EXERCISE</Text>
              <Text style={[styles.columnHeaderText, { flex: 1 }]}>SETS</Text>
              <Text style={[styles.columnHeaderText, { flex: 1.5 }]}>EQUIPMENT</Text>
            </View>
            {section.exercises.map((ex, ei) => (
              <View key={ei} style={styles.exerciseRow}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  {ex.notes && <Text style={styles.exerciseNotes}>{ex.notes}</Text>}
                </View>
                <Text style={styles.exerciseSets}>{ex.setsSummary}</Text>
                <Text style={styles.exerciseEquip}>{ex.equipment}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${clinicName}  ·  Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}
