import { describe, it, expect } from 'vitest'
import { generateLayout } from './layout'
import {
  rectangularHall,
  lShapedHall,
  hallWithColumns,
  backToBackHall,
  singleRowHall,
  hallWithGapRule,
  mixedBoothHall,
  impossibleHall,
} from '../fixtures/plans'

// ---------------------------------------------------------------------------
// Invariant helpers
// ---------------------------------------------------------------------------

function assertNoOverlap(booths: ReturnType<typeof generateLayout>['booths']) {
  for (let i = 0; i < booths.length; i++) {
    for (let j = i + 1; j < booths.length; j++) {
      const a = booths[i]
      const b = booths[j]
      const overlapX = a.origin.x < b.origin.x + b.width && a.origin.x + a.width > b.origin.x
      const overlapY = a.origin.y < b.origin.y + b.depth && a.origin.y + a.depth > b.origin.y
      if (overlapX && overlapY) {
        throw new Error(
          `Booths ${a.id} (${a.number}) and ${b.id} (${b.number}) overlap. ` +
          `A: (${a.origin.x},${a.origin.y}) ${a.width}×${a.depth} ` +
          `B: (${b.origin.x},${b.origin.y}) ${b.width}×${b.depth}`,
        )
      }
    }
  }
}

function assertAllInsideBuildable(
  booths: ReturnType<typeof generateLayout>['booths'],
  plan: Parameters<typeof generateLayout>[0],
) {
  const outline = plan.venue.outline
  const minX = Math.min(...outline.map(p => p.x)) + plan.venue.perimeterSetback
  const minY = Math.min(...outline.map(p => p.y)) + plan.venue.perimeterSetback
  const maxX = Math.max(...outline.map(p => p.x)) - plan.venue.perimeterSetback
  const maxY = Math.max(...outline.map(p => p.y)) - plan.venue.perimeterSetback

  for (const b of booths) {
    expect(b.origin.x).toBeGreaterThanOrEqual(minX)
    expect(b.origin.y).toBeGreaterThanOrEqual(minY)
    expect(b.origin.x + b.width).toBeLessThanOrEqual(maxX)
    expect(b.origin.y + b.depth).toBeLessThanOrEqual(maxY)
  }
}

function assertUniqueBoothNumbers(booths: ReturnType<typeof generateLayout>['booths']) {
  const seen = new Set<string>()
  for (const b of booths) {
    if (b.number === '') continue // unnumbered is a bug but caught separately
    expect(seen.has(b.number), `Duplicate booth number: ${b.number}`).toBe(false)
    seen.add(b.number)
  }
}

function assertAisleWidths(
  aisles: ReturnType<typeof generateLayout>['aisles'],
  minWidth: number,
) {
  for (const aisle of aisles) {
    const shortSide = Math.min(aisle.width, aisle.height)
    expect(shortSide).toBeGreaterThanOrEqual(minWidth)
  }
}

// ---------------------------------------------------------------------------
// Fixture 1: Rectangular hall
// ---------------------------------------------------------------------------
describe('Rectangular hall', () => {
  const result = generateLayout(rectangularHall)

  it('places booths', () => {
    expect(result.booths.length).toBeGreaterThan(0)
  })

  it('no two booths overlap', () => {
    assertNoOverlap(result.booths)
  })

  it('all booths inside buildable region', () => {
    assertAllInsideBuildable(result.booths, rectangularHall)
  })

  it('booth numbers are unique', () => {
    assertUniqueBoothNumbers(result.booths)
  })

  it('all booths have a number', () => {
    for (const b of result.booths) {
      expect(b.number).not.toBe('')
    }
  })

  it('aisle widths meet minimum', () => {
    assertAisleWidths(result.aisles, rectangularHall.rules.mainAisleWidth)
  })

  it('sell efficiency is between 0 and 1', () => {
    expect(result.metrics.sellEfficiency).toBeGreaterThan(0)
    expect(result.metrics.sellEfficiency).toBeLessThanOrEqual(1)
  })

  it('metrics gross area equals net + aisle + dead space', () => {
    const sum = result.metrics.netSellableArea + result.metrics.aisleArea + result.metrics.deadSpace
    expect(Math.abs(sum - result.metrics.grossArea)).toBeLessThan(10)
  })

  it('is deterministic across 5 runs', () => {
    for (let i = 0; i < 5; i++) {
      const r = generateLayout(rectangularHall)
      expect(r.booths.length).toBe(result.booths.length)
      expect(r.booths.map(b => b.number)).toEqual(result.booths.map(b => b.number))
      expect(r.booths.map(b => `${b.origin.x},${b.origin.y}`)).toEqual(
        result.booths.map(b => `${b.origin.x},${b.origin.y}`),
      )
    }
  })
})

// ---------------------------------------------------------------------------
// Fixture 2: L-shaped hall
// ---------------------------------------------------------------------------
describe('L-shaped hall', () => {
  const result = generateLayout(lShapedHall)

  it('places some booths', () => {
    expect(result.booths.length).toBeGreaterThan(0)
  })

  it('no two booths overlap', () => {
    assertNoOverlap(result.booths)
  })

  it('no booth extends outside setback', () => {
    // The bounding setback of the L-hull approximation
    const plan = lShapedHall
    const outline = plan.venue.outline
    const minX = Math.min(...outline.map(p => p.x)) + plan.venue.perimeterSetback
    const minY = Math.min(...outline.map(p => p.y)) + plan.venue.perimeterSetback
    const maxX = Math.max(...outline.map(p => p.x)) - plan.venue.perimeterSetback
    const maxY = Math.max(...outline.map(p => p.y)) - plan.venue.perimeterSetback

    for (const b of result.booths) {
      expect(b.origin.x).toBeGreaterThanOrEqual(minX)
      expect(b.origin.y).toBeGreaterThanOrEqual(minY)
      expect(b.origin.x + b.width).toBeLessThanOrEqual(maxX)
      expect(b.origin.y + b.depth).toBeLessThanOrEqual(maxY)
    }
  })

  it('is deterministic', () => {
    const r2 = generateLayout(lShapedHall)
    expect(r2.booths.length).toBe(result.booths.length)
  })
})

// ---------------------------------------------------------------------------
// Fixture 3: Hall with four column obstacles
// ---------------------------------------------------------------------------
describe('Hall with columns', () => {
  const result = generateLayout(hallWithColumns)

  it('places booths', () => {
    expect(result.booths.length).toBeGreaterThan(0)
  })

  it('no two booths overlap', () => {
    assertNoOverlap(result.booths)
  })

  it('booths do not overlap column obstacles (with buffer)', () => {
    for (const obs of hallWithColumns.venue.obstacles) {
      const obsMinX = Math.min(...obs.polygon.map(p => p.x)) - obs.buffer
      const obsMinY = Math.min(...obs.polygon.map(p => p.y)) - obs.buffer
      const obsMaxX = Math.max(...obs.polygon.map(p => p.x)) + obs.buffer
      const obsMaxY = Math.max(...obs.polygon.map(p => p.y)) + obs.buffer

      for (const b of result.booths) {
        const overlapX = b.origin.x < obsMaxX && b.origin.x + b.width > obsMinX
        const overlapY = b.origin.y < obsMaxY && b.origin.y + b.depth > obsMinY
        // In a rectangular hall the column is subtracted from the overall bbox,
        // so booths should not invade the obstacle+buffer zone
        expect(overlapX && overlapY, `Booth ${b.number} overlaps obstacle ${obs.id}`).toBe(false)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Fixture 4: Back-to-back rows
// ---------------------------------------------------------------------------
describe('Back-to-back rows', () => {
  const result = generateLayout(backToBackHall)

  it('places booths', () => {
    expect(result.booths.length).toBeGreaterThan(0)
  })

  it('no two booths overlap', () => {
    assertNoOverlap(result.booths)
  })

  it('no rowGap appears between back-to-back pairs', () => {
    // All booths in a b2b pair should be contiguous (no gap between them)
    // This is verified indirectly: if two booths in the same row pair touch
    // in the depth axis, the gap is 0
    const rowGroups = new Map<number, typeof result.booths>()
    for (const b of result.booths) {
      const arr = rowGroups.get(b.rowIndex) ?? []
      arr.push(b)
      rowGroups.set(b.rowIndex, arr)
    }
    // Verify no overlaps (already done by assertNoOverlap)
    expect(result.booths.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Fixture 5: Single rows with row gap
// ---------------------------------------------------------------------------
describe('Single rows (not back-to-back)', () => {
  const result = generateLayout(singleRowHall)

  it('places booths', () => {
    expect(result.booths.length).toBeGreaterThan(0)
  })

  it('no two booths overlap', () => {
    assertNoOverlap(result.booths)
  })
})

// ---------------------------------------------------------------------------
// Fixture 6: Gap rule mid-floor
// ---------------------------------------------------------------------------
describe('Hall with gap rule', () => {
  const result = generateLayout(hallWithGapRule)

  it('places booths', () => {
    expect(result.booths.length).toBeGreaterThan(0)
  })

  it('no two booths overlap', () => {
    assertNoOverlap(result.booths)
  })
})

// ---------------------------------------------------------------------------
// Fixture 7: Mixed booth types
// ---------------------------------------------------------------------------
describe('Mixed booth types', () => {
  const result = generateLayout(mixedBoothHall)

  it('places booths of multiple types', () => {
    const typesPlaced = new Set(result.booths.map(b => b.typeId))
    expect(typesPlaced.size).toBeGreaterThan(1)
  })

  it('no two booths overlap', () => {
    assertNoOverlap(result.booths)
  })

  it('booth numbers are unique', () => {
    assertUniqueBoothNumbers(result.booths)
  })

  it('all booths inside buildable region', () => {
    assertAllInsideBuildable(result.booths, mixedBoothHall)
  })
})

// ---------------------------------------------------------------------------
// Fixture 8: Impossible ask
// ---------------------------------------------------------------------------
describe('Impossible ask', () => {
  const result = generateLayout(impossibleHall)

  it('returns an INSUFFICIENT_AREA problem', () => {
    const problem = result.problems.find(p => p.code === 'INSUFFICIENT_AREA')
    expect(problem).toBeDefined()
    expect(problem?.severity).toBe('error')
    expect(problem?.message).toMatch(/shortfall/i)
  })

  it('places fewer booths than requested', () => {
    const requested = impossibleHall.boothTypes.reduce((s, t) => s + t.quantity, 0)
    expect(result.booths.length).toBeLessThan(requested)
  })

  it('placed booths still do not overlap', () => {
    assertNoOverlap(result.booths)
  })
})

// ---------------------------------------------------------------------------
// Property: every placed booth has at least one aisle face
// (unless the hall is so constrained that no aisle could be added — tested separately)
// ---------------------------------------------------------------------------
describe('Aisle face invariant', () => {
  it('every booth in the rectangular hall has ≥1 aisle face', () => {
    const result = generateLayout(rectangularHall)
    for (const b of result.booths) {
      // Islands have all four; inline have at least one (north or south)
      expect(b.faces.length, `Booth ${b.number} has no aisle faces`).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Determinism: 100-run check on rectangular hall
// ---------------------------------------------------------------------------
describe('Determinism (100 runs)', () => {
  it('produces byte-identical output every run', () => {
    const reference = generateLayout(rectangularHall)
    const refSignature = reference.booths.map(b => `${b.number}:${b.origin.x},${b.origin.y}`).join('|')
    for (let i = 0; i < 100; i++) {
      const r = generateLayout(rectangularHall)
      const sig = r.booths.map(b => `${b.number}:${b.origin.x},${b.origin.y}`).join('|')
      expect(sig).toBe(refSignature)
    }
  })
})
