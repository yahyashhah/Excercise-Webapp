import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateClinicalPlan } from '@/lib/services/ai.service'

export const maxDuration = 30

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!dbUser || dbUser.role !== 'CLINICIAN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const plan = await generateClinicalPlan(body)
    return NextResponse.json({ success: true, data: plan })
  } catch (error) {
    console.error('Clinical plan generation failed:', error)
    return NextResponse.json(
      { error: 'Failed to generate clinical plan' },
      { status: 500 }
    )
  }
}
