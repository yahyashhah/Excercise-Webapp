import { describe, it, expect } from 'vitest'
import { createProgramSchema } from '../program'

describe('createProgramSchema', () => {
  it('defaults organizationIds to an empty array when omitted', () => {
    const result = createProgramSchema.safeParse({ name: 'Test Program' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.organizationIds).toEqual([])
    }
  })

  it('accepts an explicit organizationIds array', () => {
    const result = createProgramSchema.safeParse({
      name: 'Test Program',
      organizationIds: ['org_1', 'org_2'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.organizationIds).toEqual(['org_1', 'org_2'])
    }
  })
})
