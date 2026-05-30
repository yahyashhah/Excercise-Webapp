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
