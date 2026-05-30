# Share Program & Clinician Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PDF/email/print sharing to program detail view, and send clinicians in-app + email notifications when a client completes a session or hits the 2-miss-in-14-days threshold.

**Architecture:** Feature 1 adds a Share popover to `ProgramDetailView` backed by a new `/api/programs/[id]/pdf` route (V2 model) and a `shareProgramViaEmailAction` server action using Resend. Feature 2 wires `completeSessionV2Action` to fire a `SESSION_COMPLETED` in-app notification + email to the clinician, and extends the existing `checkComplianceAndNotify()` to also send an email alongside the existing in-app alert.

**Tech Stack:** Next.js 15 App Router, `@react-pdf/renderer`, Resend, Prisma (MongoDB), Clerk auth, shadcn/ui (Popover, Button, Badge), Vitest.

---

## File Map

**Create:**
- `app/api/programs/[id]/pdf/route.ts` — PDF generation for V2 Program model
- `lib/pdf/program-document.tsx` — React-PDF component for V2 programs
- `lib/email/templates/share-program.tsx` — Resend email template: share plan
- `lib/email/templates/session-completed.tsx` — Resend email template: clinician completion alert
- `lib/email/templates/missed-session.tsx` — Resend email template: missed session alert

**Modify:**
- `actions/program-actions.ts` — add `shareProgramViaEmailAction`
- `actions/session-v2-actions.ts` — add clinician notification inside `completeSessionV2Action`
- `actions/compliance-actions.ts` — add Resend email after in-app alert in `checkComplianceAndNotify`
- `components/programs/program-detail-view.tsx` — add Share button + popover

---

## Task 1: PDF Document Component for V2 Programs

**Files:**
- Create: `lib/pdf/program-document.tsx`

- [ ] **Step 1: Write the failing test**

Create `lib/pdf/__tests__/program-document.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildProgramPdfSections } from '../program-document'

const makeWorkout = (name: string, exercises: string[]) => ({
  id: '1',
  name,
  estimatedMinutes: null,
  blocks: [{
    id: 'b1',
    name: 'Block 1',
    type: 'NORMAL',
    rounds: 1,
    exercises: exercises.map((exName, i) => ({
      id: String(i),
      notes: null,
      restSeconds: null,
      exercise: {
        name: exName,
        equipmentRequired: ['Resistance Band'],
        description: null,
      },
      sets: [{ targetReps: 10, targetWeight: null, targetDuration: null, setType: 'NORMAL' }],
    })),
  }],
})

describe('buildProgramPdfSections', () => {
  it('returns one section per workout', () => {
    const sections = buildProgramPdfSections([
      makeWorkout('Day 1', ['Squat', 'Lunge']),
      makeWorkout('Day 2', ['Bridge']),
    ])
    expect(sections).toHaveLength(2)
    expect(sections[0].workoutName).toBe('Day 1')
    expect(sections[1].workoutName).toBe('Day 2')
  })

  it('lists all exercises in each section', () => {
    const sections = buildProgramPdfSections([makeWorkout('Day 1', ['Squat', 'Lunge'])])
    expect(sections[0].exercises).toHaveLength(2)
    expect(sections[0].exercises[0].name).toBe('Squat')
  })

  it('formats sets as "10 reps" when only reps are set', () => {
    const sections = buildProgramPdfSections([makeWorkout('Day 1', ['Squat'])])
    expect(sections[0].exercises[0].setsSummary).toBe('10 reps')
  })

  it('returns empty array for program with no workouts', () => {
    expect(buildProgramPdfSections([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/pdf/__tests__/program-document.test.ts
```

Expected: FAIL — "Cannot find module '../program-document'"

- [ ] **Step 3: Implement `buildProgramPdfSections` and the PDF React component**

Create `lib/pdf/program-document.tsx`:

```tsx
import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'

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
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, textAlign: 'center', fontSize: 9, color: '#d1d5db' },
})

interface ProgramDocumentProps {
  programName: string
  patientName: string | null
  clinicName: string
  sections: PdfSection[]
}

export function ProgramDocument({ programName, patientName, clinicName, sections }: ProgramDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{programName}</Text>
          {patientName && (
            <Text style={styles.subtitle}>Patient: {patientName}</Text>
          )}
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

        <Text style={styles.footer} render={({ pageNumber, totalPages }) =>
          `${clinicName}  ·  Page ${pageNumber} of ${totalPages}`
        } fixed />
      </Page>
    </Document>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/pdf/__tests__/program-document.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/program-document.tsx lib/pdf/__tests__/program-document.test.ts
git commit -m "feat: add PDF document component for V2 programs"
```

---

## Task 2: PDF API Route for V2 Programs

**Files:**
- Create: `app/api/programs/[id]/pdf/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/programs/[id]/pdf/route.ts
import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { renderToBuffer } from '@react-pdf/renderer'
import { ProgramDocument, buildProgramPdfSections } from '@/lib/pdf/program-document'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const program = await prisma.program.findUnique({
    where: { id },
    include: {
      clinician: { select: { id: true, firstName: true, lastName: true } },
      patient: { select: { firstName: true, lastName: true } },
      workouts: {
        orderBy: { orderIndex: 'asc' },
        include: {
          blocks: {
            orderBy: { orderIndex: 'asc' },
            include: {
              exercises: {
                orderBy: { orderIndex: 'asc' },
                include: {
                  exercise: { select: { name: true, equipmentRequired: true, description: true } },
                  sets: { orderBy: { orderIndex: 'asc' } },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Auth: clinician who owns it, or the assigned patient
  const isOwner = program.clinicianId === dbUser.id
  const isPatient = program.patientId === dbUser.id
  if (!isOwner && !isPatient) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const patientName = program.patient
    ? `${program.patient.firstName} ${program.patient.lastName}`
    : null

  const sections = buildProgramPdfSections(
    program.workouts as unknown as Record<string, unknown>[]
  )

  const buffer = await renderToBuffer(
    React.createElement(ProgramDocument, {
      programName: program.name,
      patientName,
      clinicName: 'INMOTUS RX',
      sections,
    })
  )

  const filename = program.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"`,
    },
  })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/programs/[id]/pdf/route.ts
git commit -m "feat: add PDF download route for V2 programs"
```

---

## Task 3: Share Program Email Template

**Files:**
- Create: `lib/email/templates/share-program.tsx`

- [ ] **Step 1: Create the template**

```tsx
// lib/email/templates/share-program.tsx
import * as React from 'react'

interface ShareProgramEmailProps {
  programName: string
  patientName: string | null
  senderName: string
  pdfLink: string
  clinicName?: string
}

export function ShareProgramEmail({
  programName,
  patientName,
  senderName,
  pdfLink,
  clinicName = 'INMOTUS RX',
}: ShareProgramEmailProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Your Exercise Plan</title>
      </head>
      <body style={styles.body}>
        <table width="100%" cellPadding={0} cellSpacing={0} style={styles.outerTable}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '40px 16px' }}>
                <table width="100%" cellPadding={0} cellSpacing={0} style={styles.card}>
                  <tbody>
                    <tr>
                      <td style={styles.headerBar}>
                        <p style={styles.brandName}>{clinicName}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.bodyPad}>
                        <p style={styles.greeting}>
                          {patientName ? `Hi ${patientName},` : 'Hello,'}
                        </p>
                        <p style={styles.intro}>
                          {senderName} has shared your exercise plan with you.
                        </p>
                        <table width="100%" cellPadding={0} cellSpacing={0} style={styles.detailsCard}>
                          <tbody>
                            <tr>
                              <td style={styles.detailsPad}>
                                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>
                                  {programName}
                                </p>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginTop: 28, textAlign: 'center' }}>
                          <tbody>
                            <tr>
                              <td align="center">
                                <a href={pdfLink} style={styles.ctaButton}>
                                  Download Exercise Plan (PDF)
                                </a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p style={styles.footnote}>
                          This link opens directly to your exercise plan. If you have questions, please contact your care team.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.footer}>
                        <p style={styles.footerText}>
                          &copy; {new Date().getFullYear()} {clinicName}. All rights reserved.
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: { backgroundColor: '#f4f6f9', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: 0 },
  outerTable: { backgroundColor: '#f4f6f9', maxWidth: '600px', margin: '0 auto' },
  card: { backgroundColor: '#ffffff', borderRadius: '12px', maxWidth: '560px', width: '100%', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  headerBar: { backgroundColor: '#2563eb', padding: '24px 32px' },
  brandName: { color: '#ffffff', fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '0.5px' },
  bodyPad: { padding: '32px' },
  greeting: { color: '#111827', fontSize: '20px', fontWeight: 600, margin: '0 0 12px 0' },
  intro: { color: '#4b5563', fontSize: '15px', lineHeight: '1.6', margin: '0 0 24px 0' },
  detailsCard: { backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e5e7eb' },
  detailsPad: { padding: '20px 24px' },
  ctaButton: { backgroundColor: '#2563eb', borderRadius: '8px', color: '#ffffff', display: 'inline-block', fontSize: '15px', fontWeight: 600, padding: '12px 28px', textDecoration: 'none' },
  footnote: { color: '#9ca3af', fontSize: '13px', lineHeight: '1.5', marginTop: '28px', marginBottom: 0 },
  footer: { backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', padding: '20px 32px' },
  footerText: { color: '#9ca3af', fontSize: '12px', lineHeight: '1.5', margin: '0 0 4px 0' },
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/email/templates/share-program.tsx
git commit -m "feat: add share-program email template"
```

---

## Task 4: Share Program Server Action

**Files:**
- Modify: `actions/program-actions.ts`

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/program-share.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseShareRecipients } from '../program-share-helpers'

describe('parseShareRecipients', () => {
  it('returns primary email in array', () => {
    expect(parseShareRecipients('a@b.com', '')).toEqual(['a@b.com'])
  })

  it('includes CC addresses when provided', () => {
    expect(parseShareRecipients('a@b.com', 'c@d.com, e@f.com')).toEqual([
      'a@b.com', 'c@d.com', 'e@f.com',
    ])
  })

  it('trims whitespace from CC addresses', () => {
    expect(parseShareRecipients('a@b.com', '  c@d.com  ,  e@f.com  ')).toEqual([
      'a@b.com', 'c@d.com', 'e@f.com',
    ])
  })

  it('filters out empty CC entries', () => {
    expect(parseShareRecipients('a@b.com', 'c@d.com,,,')).toEqual([
      'a@b.com', 'c@d.com',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run actions/__tests__/program-share.test.ts
```

Expected: FAIL — "Cannot find module '../program-share-helpers'"

- [ ] **Step 3: Create the helper and add the action**

Create `actions/program-share-helpers.ts`:

```typescript
export function parseShareRecipients(toEmail: string, ccRaw: string): string[] {
  const cc = ccRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [toEmail, ...cc]
}
```

Then add to the **bottom** of `actions/program-actions.ts`:

```typescript
import { getResend } from '@/lib/email/resend'
import { ShareProgramEmail } from '@/lib/email/templates/share-program'
import { parseShareRecipients } from './program-share-helpers'

export async function shareProgramViaEmailAction(
  programId: string,
  toEmail: string,
  ccRaw: string
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'Unauthorized' }

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!dbUser || dbUser.role !== 'CLINICIAN') return { success: false, error: 'Forbidden' }

  const program = await prisma.program.findUnique({
    where: { id: programId, clinicianId: dbUser.id },
    select: {
      name: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  })
  if (!program) return { success: false, error: 'Program not found' }

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmotusrx.vercel.app'
  const pdfLink = `${appBaseUrl}/api/programs/${programId}/pdf`
  const senderName = `${dbUser.firstName} ${dbUser.lastName}`
  const patientName = program.patient
    ? `${program.patient.firstName} ${program.patient.lastName}`
    : null

  const recipients = parseShareRecipients(toEmail, ccRaw)

  try {
    await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'noreply@inmotusrx.com',
      to: recipients,
      subject: `Your exercise plan: ${program.name}`,
      react: React.createElement(ShareProgramEmail, {
        programName: program.name,
        patientName,
        senderName,
        pdfLink,
      }),
    })
    return { success: true }
  } catch (err) {
    console.error('Failed to send share email:', err)
    return { success: false, error: 'Failed to send email' }
  }
}
```

Also add `import React from 'react'` to the top of `actions/program-actions.ts` if not already present.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run actions/__tests__/program-share.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add actions/program-share-helpers.ts actions/__tests__/program-share.test.ts actions/program-actions.ts
git commit -m "feat: add shareProgramViaEmailAction server action"
```

---

## Task 5: Share Button UI in ProgramDetailView

**Files:**
- Modify: `components/programs/program-detail-view.tsx`

- [ ] **Step 1: Add the Share popover to the clinician action bar**

In `components/programs/program-detail-view.tsx`, make the following changes:

**1. Add new imports at the top** (alongside existing shadcn/ui imports):

```typescript
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Share2, Download, Mail, Printer } from "lucide-react";
import { shareProgramViaEmailAction } from "@/actions/program-actions";
```

**2. Add share state** inside the component body, after the existing `useState` calls:

```typescript
const [shareOpen, setShareOpen] = useState(false);
const [shareTo, setShareTo] = useState(
  (patient as Record<string, string> | null)?.email ?? ""
);
const [shareCc, setShareCc] = useState("");
const [shareLoading, setShareLoading] = useState(false);
```

**3. Add `handleDownloadPdf` helper** inside the component body:

```typescript
async function handleDownloadPdf() {
  const res = await fetch(`/api/programs/${program.id as string}/pdf`);
  if (!res.ok) { toast.error("Failed to generate PDF"); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(program.name as string).replace(/[^a-z0-9]/gi, "_").toLowerCase()}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
```

**4. Add `handleSendEmail` helper** inside the component body:

```typescript
async function handleSendEmail() {
  if (!shareTo) { toast.error("Enter a recipient email"); return; }
  setShareLoading(true);
  const result = await shareProgramViaEmailAction(
    program.id as string,
    shareTo,
    shareCc
  );
  setShareLoading(false);
  if (result.success) {
    toast.success("Plan sent successfully");
    setShareOpen(false);
  } else {
    toast.error(result.error ?? "Failed to send email");
  }
}
```

**5. Replace the clinician action buttons section** (the `{isClinician && (...)}`  block that contains Edit / Duplicate / Assign) with the version below that adds the Share button:

```tsx
{isClinician && (
  <div className="flex items-center gap-2">
    <Button variant="outline" asChild>
      <Link href={`/programs/${program.id}/edit`}>
        <Pencil className="mr-2 h-4 w-4" /> Edit
      </Link>
    </Button>
    <Button
      variant="outline"
      onClick={async () => {
        const r = await duplicateProgramAction(program.id as string);
        if (r.success) { toast.success("Duplicated"); router.refresh(); }
        else toast.error(r.error);
      }}
    >
      <Copy className="mr-2 h-4 w-4" /> Duplicate
    </Button>
    {!patientId && (
      <Button onClick={() => setAssignOpen(true)}>
        <UserPlus className="mr-2 h-4 w-4" /> Assign
      </Button>
    )}
    {/* Share popover */}
    <Popover open={shareOpen} onOpenChange={setShareOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Share2 className="mr-2 h-4 w-4" /> Share
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <p className="text-sm font-semibold">Share Exercise Plan</p>
          <Separator />
          {/* Download */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={() => { setShareOpen(false); handleDownloadPdf(); }}
          >
            <Download className="h-4 w-4" /> Download PDF
          </Button>
          {/* Print */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={() => {
              setShareOpen(false);
              window.open(`/api/programs/${program.id as string}/pdf`);
            }}
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Separator />
          {/* Email */}
          <div className="space-y-2">
            <div>
              <Label htmlFor="share-to" className="text-xs">To</Label>
              <Input
                id="share-to"
                type="email"
                placeholder="patient@email.com"
                value={shareTo}
                onChange={(e) => setShareTo(e.target.value)}
                className="h-8 text-sm mt-1"
              />
            </div>
            <div>
              <Label htmlFor="share-cc" className="text-xs text-muted-foreground">
                CC (comma-separated)
              </Label>
              <Input
                id="share-cc"
                type="text"
                placeholder="other@email.com, ..."
                value={shareCc}
                onChange={(e) => setShareCc(e.target.value)}
                className="h-8 text-sm mt-1"
              />
            </div>
            <Button
              className="w-full gap-2"
              size="sm"
              onClick={handleSendEmail}
              disabled={shareLoading || !shareTo}
            >
              <Mail className="h-4 w-4" />
              {shareLoading ? "Sending…" : "Send Email"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  </div>
)}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/programs/program-detail-view.tsx
git commit -m "feat: add Share button (download PDF, print, email) to program detail view"
```

---

## Task 6: Session Completed Email Template

**Files:**
- Create: `lib/email/templates/session-completed.tsx`

- [ ] **Step 1: Create the template**

```tsx
// lib/email/templates/session-completed.tsx
import * as React from 'react'

interface SessionCompletedEmailProps {
  clinicianName: string
  patientName: string
  workoutName: string
  programName: string
  patientLink: string
  clinicName?: string
}

export function SessionCompletedEmail({
  clinicianName,
  patientName,
  workoutName,
  programName,
  patientLink,
  clinicName = 'INMOTUS RX',
}: SessionCompletedEmailProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Session Completed</title>
      </head>
      <body style={styles.body}>
        <table width="100%" cellPadding={0} cellSpacing={0} style={styles.outerTable}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '40px 16px' }}>
                <table width="100%" cellPadding={0} cellSpacing={0} style={styles.card}>
                  <tbody>
                    <tr>
                      <td style={styles.headerBar}>
                        <p style={styles.brandName}>{clinicName}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.bodyPad}>
                        <p style={styles.greeting}>Hi {clinicianName},</p>
                        <p style={styles.intro}>
                          Your client <strong>{patientName}</strong> just completed a workout session.
                        </p>
                        <table width="100%" cellPadding={0} cellSpacing={0} style={styles.detailsCard}>
                          <tbody>
                            <tr>
                              <td style={styles.detailsPad}>
                                <DetailRow label="Patient" value={patientName} />
                                <DetailRow label="Workout" value={workoutName} />
                                <DetailRow label="Program" value={programName} />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginTop: 28, textAlign: 'center' }}>
                          <tbody>
                            <tr>
                              <td align="center">
                                <a href={patientLink} style={styles.ctaButton}>View Patient Progress</a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p style={styles.footnote}>You received this alert because you are the assigned clinician for this patient.</p>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.footer}>
                        <p style={styles.footerText}>&copy; {new Date().getFullYear()} {clinicName}. All rights reserved.</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: '12px' }}>
      <tbody>
        <tr>
          <td style={styles.detailLabel}>{label}</td>
          <td style={styles.detailValue}>{value}</td>
        </tr>
      </tbody>
    </table>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: { backgroundColor: '#f4f6f9', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: 0 },
  outerTable: { backgroundColor: '#f4f6f9', maxWidth: '600px', margin: '0 auto' },
  card: { backgroundColor: '#ffffff', borderRadius: '12px', maxWidth: '560px', width: '100%', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  headerBar: { backgroundColor: '#16a34a', padding: '24px 32px' },
  brandName: { color: '#ffffff', fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '0.5px' },
  bodyPad: { padding: '32px' },
  greeting: { color: '#111827', fontSize: '20px', fontWeight: 600, margin: '0 0 12px 0' },
  intro: { color: '#4b5563', fontSize: '15px', lineHeight: '1.6', margin: '0 0 24px 0' },
  detailsCard: { backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e5e7eb' },
  detailsPad: { padding: '20px 24px' },
  detailLabel: { color: '#6b7280', fontSize: '13px', fontWeight: 500, width: '80px', paddingBottom: '4px', verticalAlign: 'top' },
  detailValue: { color: '#111827', fontSize: '14px', fontWeight: 600, paddingBottom: '4px', verticalAlign: 'top' },
  ctaButton: { backgroundColor: '#16a34a', borderRadius: '8px', color: '#ffffff', display: 'inline-block', fontSize: '15px', fontWeight: 600, padding: '12px 28px', textDecoration: 'none' },
  footnote: { color: '#9ca3af', fontSize: '13px', lineHeight: '1.5', marginTop: '28px', marginBottom: 0 },
  footer: { backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', padding: '20px 32px' },
  footerText: { color: '#9ca3af', fontSize: '12px', lineHeight: '1.5', margin: '0 0 4px 0' },
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/email/templates/session-completed.tsx
git commit -m "feat: add session-completed email template for clinician alerts"
```

---

## Task 7: Wire Completion Alert into completeSessionV2Action

**Files:**
- Modify: `actions/session-v2-actions.ts`

- [ ] **Step 1: Add the notification + email logic inside `completeSessionV2Action`**

In `actions/session-v2-actions.ts`, replace the existing `completeSessionV2Action` (lines 106–135) with:

```typescript
export async function completeSessionV2Action(
  sessionId: string,
  overallRPE?: number,
  overallNotes?: string
) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) return { success: false, error: "User not found" };

    await prisma.workoutSessionV2.update({
      where: { id: sessionId, patientId: dbUser.id },
      data: { status: "COMPLETED", completedAt: new Date(), overallRPE, overallNotes },
    });

    // Fire clinician notification (non-blocking — failures must not break completion)
    try {
      await notifyClinicianOnCompletion(sessionId, dbUser);
    } catch (notifyErr) {
      console.error("Completion notification failed (non-fatal):", notifyErr);
    }

    revalidatePath("/dashboard");
    revalidatePath("/sessions/" + sessionId);
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Failed to complete session" };
  }
}
```

Also add the helper function `notifyClinicianOnCompletion` in the same file, **before** `completeSessionV2Action`:

```typescript
import React from "react";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/services/notification.service";
import { getResend } from "@/lib/email/resend";
import { SessionCompletedEmail } from "@/lib/email/templates/session-completed";

async function notifyClinicianOnCompletion(
  sessionId: string,
  patient: { id: string; firstName: string; lastName: string }
) {
  const session = await prisma.workoutSessionV2.findUnique({
    where: { id: sessionId },
    include: {
      workout: {
        include: {
          program: {
            include: {
              clinician: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
        },
      },
    },
  });

  if (!session?.workout.program.clinician) return;

  const { clinician } = session.workout.program;
  const patientName = `${patient.firstName} ${patient.lastName}`;
  const workoutName = session.workout.name;
  const programName = session.workout.program.name;
  const programId = session.workout.program.id;
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inmotusrx.vercel.app";
  const patientLink = `${appBaseUrl}/programs/${programId}`;

  // In-app notification
  await createNotification({
    userId: clinician.id,
    type: NOTIFICATION_TYPES.SESSION_COMPLETED,
    title: "Session Completed",
    body: `${patientName} completed "${workoutName}".`,
    link: patientLink,
    metadata: { patientId: patient.id, patientName, workoutName, programId },
  });

  // Email
  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@inmotusrx.com",
    to: clinician.email,
    subject: `${patientName} completed a session`,
    react: React.createElement(SessionCompletedEmail, {
      clinicianName: `${clinician.firstName} ${clinician.lastName}`,
      patientName,
      workoutName,
      programName,
      patientLink,
    }),
  });
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add actions/session-v2-actions.ts
git commit -m "feat: notify clinician via in-app + email when patient completes session"
```

---

## Task 8: Missed Session Email Template + Wire into checkComplianceAndNotify

**Files:**
- Create: `lib/email/templates/missed-session.tsx`
- Modify: `actions/compliance-actions.ts`

- [ ] **Step 1: Create the missed-session email template**

```tsx
// lib/email/templates/missed-session.tsx
import * as React from 'react'

interface MissedSessionEmailProps {
  clinicianName: string
  patientName: string
  missedCount: number
  lookbackDays: number
  patientLink: string
  clinicName?: string
}

export function MissedSessionEmail({
  clinicianName,
  patientName,
  missedCount,
  lookbackDays,
  patientLink,
  clinicName = 'INMOTUS RX',
}: MissedSessionEmailProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Missed Sessions Alert</title>
      </head>
      <body style={styles.body}>
        <table width="100%" cellPadding={0} cellSpacing={0} style={styles.outerTable}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '40px 16px' }}>
                <table width="100%" cellPadding={0} cellSpacing={0} style={styles.card}>
                  <tbody>
                    <tr>
                      <td style={styles.headerBar}>
                        <p style={styles.brandName}>{clinicName}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.bodyPad}>
                        <p style={styles.greeting}>Hi {clinicianName},</p>
                        <p style={styles.intro}>
                          This is an alert that <strong>{patientName}</strong> has missed{' '}
                          <strong>{missedCount} session{missedCount !== 1 ? 's' : ''}</strong> in
                          the last {lookbackDays} days.
                        </p>
                        <p style={styles.intro}>
                          You may want to reach out to check in with your patient.
                        </p>
                        <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginTop: 28, textAlign: 'center' }}>
                          <tbody>
                            <tr>
                              <td align="center">
                                <a href={patientLink} style={styles.ctaButton}>View Patient</a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p style={styles.footnote}>You received this alert because you are the assigned clinician for this patient.</p>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.footer}>
                        <p style={styles.footerText}>&copy; {new Date().getFullYear()} {clinicName}. All rights reserved.</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: { backgroundColor: '#f4f6f9', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: 0 },
  outerTable: { backgroundColor: '#f4f6f9', maxWidth: '600px', margin: '0 auto' },
  card: { backgroundColor: '#ffffff', borderRadius: '12px', maxWidth: '560px', width: '100%', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  headerBar: { backgroundColor: '#dc2626', padding: '24px 32px' },
  brandName: { color: '#ffffff', fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '0.5px' },
  bodyPad: { padding: '32px' },
  greeting: { color: '#111827', fontSize: '20px', fontWeight: 600, margin: '0 0 12px 0' },
  intro: { color: '#4b5563', fontSize: '15px', lineHeight: '1.6', margin: '0 0 16px 0' },
  ctaButton: { backgroundColor: '#dc2626', borderRadius: '8px', color: '#ffffff', display: 'inline-block', fontSize: '15px', fontWeight: 600, padding: '12px 28px', textDecoration: 'none' },
  footnote: { color: '#9ca3af', fontSize: '13px', lineHeight: '1.5', marginTop: '28px', marginBottom: 0 },
  footer: { backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', padding: '20px 32px' },
  footerText: { color: '#9ca3af', fontSize: '12px', lineHeight: '1.5', margin: '0 0 4px 0' },
}
```

- [ ] **Step 2: Wire email into `checkComplianceAndNotify`**

In `actions/compliance-actions.ts`, add these imports at the top:

```typescript
import React from "react";
import { getResend } from "@/lib/email/resend";
import { MissedSessionEmail } from "@/lib/email/templates/missed-session";
```

Then replace the `prisma.notification.create(...)` block (the one that creates the MISSED_SESSION notification) with:

```typescript
// Create the in-app alert — metadata includes patientId for future deduplication
await prisma.notification.create({
  data: {
    userId: clinician.id,
    type: NOTIFICATION_TYPES.MISSED_SESSION,
    title: "Missed Sessions Alert",
    body: `${patientName} has missed ${missedCount} session${missedCount !== 1 ? "s" : ""} in the last 14 days.`,
    link: "/patients",
    metadata: {
      patientId: patient.id,
      patientName,
      missedCount,
    } satisfies Prisma.InputJsonObject,
  },
});

// Send email to clinician (non-blocking — failures must not break the compliance check)
try {
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inmotusrx.vercel.app";
  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@inmotusrx.com",
    to: clinician.email,
    subject: `Missed sessions: ${patientName}`,
    react: React.createElement(MissedSessionEmail, {
      clinicianName: `${clinician.firstName} ${clinician.lastName}`,
      patientName,
      missedCount,
      lookbackDays: LOOKBACK_DAYS,
      patientLink: `${appBaseUrl}/patients`,
    }),
  });
} catch (emailErr) {
  console.error("Failed to send missed-session email (non-fatal):", emailErr);
}
```

Note: `checkComplianceAndNotify` currently fetches `clinician` via `getCurrentUser()` which only returns `id` and `role`. You need to also get `clinician.email`, `clinician.firstName`, `clinician.lastName`. Replace the `getCurrentUser()` call at the top of the function with:

```typescript
const { userId } = await auth();
if (!userId) return { alerted: 0 };
const clinician = await prisma.user.findUnique({
  where: { clerkId: userId },
  select: { id: true, role: true, email: true, firstName: true, lastName: true },
});
if (!clinician || clinician.role !== "CLINICIAN") return { alerted: 0 };
```

Also add `import { auth } from "@clerk/nextjs/server"` to the imports in `compliance-actions.ts` if not already present, and remove the `getCurrentUser` import since it's no longer used.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/email/templates/missed-session.tsx actions/compliance-actions.ts
git commit -m "feat: add missed-session email alert to compliance check"
```

---

## Summary

After all tasks are complete:

| Feature | What was built |
|---------|----------------|
| **Share → Download PDF** | New `/api/programs/[id]/pdf` route using V2 Program model |
| **Share → Email** | `shareProgramViaEmailAction` + `ShareProgramEmail` template; supports patient email + CC |
| **Share → Print** | Opens PDF route in new tab; browser handles print |
| **Share UI** | Popover on `ProgramDetailView` clinician toolbar |
| **Completion alert (in-app)** | `SESSION_COMPLETED` notification created in `completeSessionV2Action` |
| **Completion alert (email)** | Green email to clinician on every patient session completion |
| **Missed-session alert (email)** | Red email added to existing `checkComplianceAndNotify` (2+ misses / 14 days) |
