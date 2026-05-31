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
                  exercise: { select: { name: true, equipmentRequired: true, description: true, videoUrl: true } },
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  )

  const filename = program.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"`,
    },
  })
}
