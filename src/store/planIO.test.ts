import { describe, it, expect } from 'vitest'
import { parsePlan } from './planIO'
import { DEFAULT_PLAN } from './planStore'

describe('parsePlan', () => {
  it('accepts a valid plan', () => {
    expect(parsePlan(DEFAULT_PLAN)).toBe(DEFAULT_PLAN)
  })

  it('rejects null', () => {
    expect(parsePlan(null)).toBeNull()
  })

  it('rejects wrong schemaVersion', () => {
    expect(parsePlan({ ...DEFAULT_PLAN, schemaVersion: 2 })).toBeNull()
  })

  it('rejects missing id', () => {
    const { id: _id, ...rest } = DEFAULT_PLAN
    expect(parsePlan(rest)).toBeNull()
  })

  it('rejects missing venue outline', () => {
    const bad = { ...DEFAULT_PLAN, venue: { ...DEFAULT_PLAN.venue, outline: 'nope' } }
    expect(parsePlan(bad)).toBeNull()
  })

  it('rejects missing boothTypes', () => {
    const { boothTypes: _bt, ...rest } = DEFAULT_PLAN
    expect(parsePlan(rest)).toBeNull()
  })

  it('rejects missing rules', () => {
    const { rules: _r, ...rest } = DEFAULT_PLAN
    expect(parsePlan(rest)).toBeNull()
  })
})
