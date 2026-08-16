import type {
  ShowPlan,
  LayoutResult,
  LayoutRules,
  BoothType,
  BoothOverride,
  PlacedBooth,
  Rect,
  Band,
  Problem,
  LayoutMetrics,
  Inches,
} from './types'
import {
  computeBuildableRegion,
  decomposeToBands,
  edgeTouchesRect,
} from './geometry'

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function generateLayout(plan: ShowPlan): LayoutResult {
  const { venue, boothTypes, rules } = plan

  const buildable = computeBuildableRegion(
    venue.outline,
    venue.perimeterSetback,
    venue.obstacles,
    venue.openings,
  )

  if (buildable.length === 0) {
    return emptyResult(plan, [{
      code: 'INSUFFICIENT_AREA',
      severity: 'error',
      message: 'The venue outline with perimeter setback applied leaves no buildable area.',
      affectedBoothIds: [],
    }])
  }

  const orientation = resolveOrientation(rules, buildable)
  const bands = decomposeToBands(buildable, orientation)

  const problems: Problem[] = []
  const allBooths: PlacedBooth[] = []
  const allAisles: Rect[] = []

  // Pre-check capacity
  const capacityProblem = capacityPreCheck(boothTypes, rules, buildable, bands)
  if (capacityProblem) problems.push(capacityProblem)

  // Sort booth types: islands first, then by priority asc, then largest depth first (FFD)
  const typeQueue = sortBoothTypes(boothTypes)
  const islandTypes = typeQueue.filter(t => t.style === 'island')
  const inlineTypes = typeQueue.filter(t => t.style !== 'island')

  // Track remaining quantity for each type
  const remaining = new Map<string, number>()
  for (const t of boothTypes) remaining.set(t.id, t.quantity)

  let boothIdCounter = 0
  const nextId = () => `booth-${++boothIdCounter}`

  // Sort bands largest-first for island placement
  const bandsByArea = [...bands].sort((a, b) => b.width * b.height - a.width * a.height)

  // Per-band cursor: how much of the band (in the depth axis) is consumed so far.
  // Island rows are carved off the TOP of the band; inline rows follow.
  const bandIslandEnd = new Map<number, Inches>() // band index → y where island zone ends

  // ---------------------------------------------------------------------------
  // Island placement
  // ---------------------------------------------------------------------------
  for (const islandType of islandTypes) {
    const qty = remaining.get(islandType.id) ?? 0
    if (qty === 0) continue

    const clearance = rules.mainAisleWidth
    // Each island cell needs: clearance on all four sides
    const cellW = islandType.width + clearance * 2
    const cellH = islandType.depth + clearance * 2

    for (const band of bandsByArea) {
      const placed = remaining.get(islandType.id) ?? 0
      if (placed === 0) break

      const bi = bands.indexOf(band)

      // Island rows are carved from the TOP of the band (y-axis)
      const startY = bandIslandEnd.get(bi) ?? band.y

      if (band.width < cellW || startY + cellH > band.y + band.height) continue

      // Determine how many columns and rows of this island fit
      const cols = Math.floor(band.width / cellW)
      if (cols === 0) continue

      let y = startY
      while (y + cellH <= band.y + band.height) {
        let x = band.x
        let placedInRow = false

        for (let col = 0; col < cols; col++) {
          const cur = remaining.get(islandType.id) ?? 0
          if (cur === 0) break

          const bx = x + clearance
          const by = y + clearance
          const booth: PlacedBooth = {
            id: nextId(),
            typeId: islandType.id,
            number: '',
            origin: { x: bx, y: by },
            width: islandType.width,
            depth: islandType.depth,
            rotation: 0,
            rowIndex: -1, // islands have no row index
            runIndex: col,
            faces: ['north', 'south', 'east', 'west'],
            isCorner: true,
            status: 'available',
            pinned: false,
          }
          allBooths.push(booth)
          remaining.set(islandType.id, cur - 1)
          placedInRow = true

          // Aisle rects around this island
          allAisles.push(
            { x: x, y, width: cellW, height: clearance },            // north
            { x: x, y: by + islandType.depth, width: cellW, height: clearance }, // south
            { x, y: by, width: clearance, height: islandType.depth }, // west
            { x: bx + islandType.width, y: by, width: clearance, height: islandType.depth }, // east
          )

          x += cellW
        }

        if (!placedInRow) break
        y += cellH
        bandIslandEnd.set(bi, y)
      }
    }

    const leftover = remaining.get(islandType.id) ?? 0
    if (leftover > 0) {
      problems.push({
        code: 'ISLAND_NO_CLEARANCE',
        severity: 'error',
        message: `Could not place ${leftover} of ${islandType.quantity} ${islandType.name} islands — insufficient clearance in any band.`,
        affectedBoothIds: [],
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Inline row placement
  // ---------------------------------------------------------------------------
  let globalRowIndex = 0

  for (let bi = 0; bi < bands.length; bi++) {
    const band = bands[bi]
    const { x: bx, y: by, width: bw, height: bh } = band

    // Start inline rows below any island zone
    let cursor = bandIslandEnd.get(bi) ?? by

    // Add a perimeter aisle at the very start of the band
    // (the first rows' north face will face this aisle)
    if (cursor < by + bh) {
      const perimAisle: Rect = { x: bx, y: cursor, width: bw, height: rules.mainAisleWidth }
      allAisles.push(perimAisle)
      cursor += rules.mainAisleWidth
    }

    while (cursor < by + bh) {
      const maxDepth = Math.max(...inlineTypes.map(t => t.depth), 0)
      if (maxDepth === 0) break

      // Check for a GapRule at this row index
      const rowGap = rules.gaps.find(
        g => g.axis === 'row' && g.afterIndex === globalRowIndex - 1,
      )
      if (rowGap) {
        allAisles.push({ x: bx, y: cursor, width: bw, height: rowGap.size })
        cursor += rowGap.size
        if (cursor >= by + bh) break
      }

      const rowPairHeight = rules.backToBack
        ? maxDepth * 2
        : maxDepth + rules.rowGap + maxDepth

      const needed = rowPairHeight + rules.mainAisleWidth
      if (cursor + needed > by + bh) break

      // Row A (front — opens to the north aisle)
      const rowAY = cursor
      const rowAResult = fillRun(
        bx, rowAY, bw, maxDepth,
        inlineTypes, remaining, rules, globalRowIndex, nextId, problems,
      )
      allBooths.push(...rowAResult.booths)
      allAisles.push(...rowAResult.aisles)
      cursor += maxDepth

      // Row B (back)
      if (rules.backToBack) {
        const rowBResult = fillRun(
          bx, cursor, bw, maxDepth,
          inlineTypes, remaining, rules, globalRowIndex, nextId, problems,
        )
        allBooths.push(...rowBResult.booths)
        allAisles.push(...rowBResult.aisles)
        cursor += maxDepth
      } else {
        // Gap between single rows
        allAisles.push({ x: bx, y: cursor, width: bw, height: rules.rowGap })
        cursor += rules.rowGap

        if (cursor + maxDepth + rules.mainAisleWidth <= by + bh) {
          const rowBResult = fillRun(
            bx, cursor, bw, maxDepth,
            inlineTypes, remaining, rules, globalRowIndex + 1, nextId, problems,
          )
          allBooths.push(...rowBResult.booths)
          allAisles.push(...rowBResult.aisles)
          cursor += maxDepth
          globalRowIndex++
        }
      }

      // Main aisle after the row pair (this is the SOUTH face aisle for row B,
      // and also the NORTH face aisle for the next row pair)
      const aisleRect: Rect = { x: bx, y: cursor, width: bw, height: rules.mainAisleWidth }
      allAisles.push(aisleRect)
      cursor += rules.mainAisleWidth
      globalRowIndex++
    }
  }

  // Apply overrides (pinned edits) and reflow affected rows
  let finalBooths = applyOverridesAndReflow(plan.overrides, allBooths, bands, problems)

  // Apply numbering after overrides (positions may have changed)
  numberBooths(finalBooths, rules.boothNumbering)

  // Detect aisle faces after overrides
  detectFaces(finalBooths, allAisles)

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------
  const buildableArea = bands.reduce((sum, b) => sum + b.width * b.height, 0)
  const aisleArea = allAisles.reduce((sum, a) => sum + a.width * a.height, 0)
  const boothArea = finalBooths.reduce((sum, b) => sum + b.width * b.depth, 0)

  const placedCount: Record<string, number> = {}
  for (const t of boothTypes) placedCount[t.id] = 0
  for (const b of finalBooths) placedCount[b.typeId] = (placedCount[b.typeId] ?? 0) + 1

  const unplacedCount: Record<string, number> = {}
  for (const t of boothTypes) {
    unplacedCount[t.id] = Math.max(0, t.quantity - (placedCount[t.id] ?? 0))
  }

  const estimatedRevenue = boothTypes.reduce((sum, t) => {
    return sum + (t.pricePerUnit ?? 0) * (placedCount[t.id] ?? 0)
  }, 0)

  const metrics: LayoutMetrics = {
    totalPlaced: finalBooths.length,
    perTypePlaced: placedCount,
    perTypeRequested: Object.fromEntries(boothTypes.map(t => [t.id, t.quantity])),
    grossArea: buildableArea,
    netSellableArea: boothArea,
    aisleArea,
    deadSpace: Math.max(0, buildableArea - boothArea - aisleArea),
    sellEfficiency: buildableArea > 0 ? boothArea / buildableArea : 0,
    estimatedRevenue,
  }

  return {
    booths: finalBooths,
    aisles: allAisles,
    placedCount,
    unplacedCount,
    metrics,
    problems,
    suggestions: [],
  }
}

// ---------------------------------------------------------------------------
// Row / run filling
// ---------------------------------------------------------------------------

interface RunResult {
  booths: PlacedBooth[]
  aisles: Rect[]
}

function fillRun(
  x: Inches,
  y: Inches,
  width: Inches,
  depth: Inches,
  types: BoothType[],
  remaining: Map<string, number>,
  rules: LayoutRules,
  rowIndex: number,
  nextId: () => string,
  problems: Problem[],
): RunResult {
  const booths: PlacedBooth[] = []
  const aisles: Rect[] = []
  let cursor = x
  let runIndex = 0
  let boothsInRun = 0

  while (cursor < x + width) {
    // Cross-aisle break
    if (boothsInRun > 0 && boothsInRun % rules.maxBoothsPerRun === 0) {
      const crossAisle: Rect = {
        x: cursor,
        y,
        width: rules.crossAisleWidth,
        height: depth,
      }
      aisles.push(crossAisle)
      cursor += rules.crossAisleWidth
      runIndex++
      if (cursor >= x + width) break
    }

    const remainingWidth = x + width - cursor

    // First-fit-decreasing: find the widest type that fits
    const type = types.find(t => {
      const qty = remaining.get(t.id) ?? 0
      return qty > 0 && t.width <= remainingWidth && t.depth <= depth
    })

    if (!type) {
      if (remainingWidth >= 12) {
        problems.push({
          code: 'ORPHAN_BOOTH',
          severity: 'info',
          message: `${Math.round(remainingWidth / 12)} ft of dead space in row ${rowIndex}.`,
          affectedBoothIds: [],
        })
      }
      break
    }

    const booth: PlacedBooth = {
      id: nextId(),
      typeId: type.id,
      number: '',
      origin: { x: cursor, y },
      width: type.width,
      depth: type.depth,
      rotation: 0,
      rowIndex,
      runIndex,
      faces: [],
      isCorner: false,
      status: 'available',
      pinned: false,
    }
    booths.push(booth)
    remaining.set(type.id, (remaining.get(type.id) ?? 0) - 1)
    cursor += type.width
    boothsInRun++
  }

  return { booths, aisles }
}

// ---------------------------------------------------------------------------
// Face and corner detection
// ---------------------------------------------------------------------------

function detectFaces(booths: PlacedBooth[], aisles: Rect[]): void {
  const faceList = ['north', 'south', 'east', 'west'] as const
  for (const booth of booths) {
    booth.faces = []
    for (const face of faceList) {
      for (const aisle of aisles) {
        if (edgeTouchesRect(booth.origin.x, booth.origin.y, booth.width, booth.depth, aisle, face)) {
          if (!booth.faces.includes(face)) booth.faces.push(face)
          break
        }
      }
    }
    booth.isCorner = booth.faces.length >= 2
  }
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

function numberBooths(booths: PlacedBooth[], scheme: LayoutRules['boothNumbering']): void {
  // Sort by row then by x for consistent ordering; islands (rowIndex=-1) come last
  const sorted = [...booths].sort((a, b) => {
    if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex
    return a.origin.x - b.origin.x
  })

  if (scheme.style === 'sequential') {
    sorted.forEach((b, i) => {
      b.number = `${scheme.prefix ?? ''}${scheme.startAt + i}`
    })
    return
  }

  if (scheme.style === 'aisle-odd-even') {
    const rowMap = new Map<number, PlacedBooth[]>()
    for (const b of sorted) {
      const arr = rowMap.get(b.rowIndex) ?? []
      arr.push(b)
      rowMap.set(b.rowIndex, arr)
    }
    const rowIndices = [...rowMap.keys()].filter(r => r >= 0).sort((a, b) => a - b)

    let aisleNum = 100

    for (let i = 0; i < rowIndices.length; i += 2) {
      const front = rowMap.get(rowIndices[i]) ?? []
      const back = rowMap.get(rowIndices[i + 1]) ?? []

      if (scheme.direction === 'serpentine') {
        let odd = aisleNum + 1
        let even = aisleNum + 2
        for (const b of front) {
          b.number = `${scheme.prefix ?? ''}${odd}`
          odd += 2
        }
        for (const b of [...back].reverse()) {
          b.number = `${scheme.prefix ?? ''}${even}`
          even += 2
        }
      } else {
        let n = aisleNum + 1
        for (const b of front) { b.number = `${scheme.prefix ?? ''}${n++}` }
        for (const b of back) { b.number = `${scheme.prefix ?? ''}${n++}` }
      }
      aisleNum += 100
    }

    // Number islands sequentially after inline booths
    let islandN = aisleNum + 1
    for (const b of sorted.filter(b => b.rowIndex < 0)) {
      b.number = `${scheme.prefix ?? ''}I${islandN++}`
    }
    return
  }

  if (scheme.style === 'block-prefix') {
    sorted.forEach((b, i) => {
      b.number = `${scheme.prefix ?? 'A'}${scheme.startAt + i}`
    })
  }
}

// ---------------------------------------------------------------------------
// Orientation resolution
// ---------------------------------------------------------------------------

function resolveOrientation(
  rules: LayoutRules,
  buildable: ReturnType<typeof computeBuildableRegion>,
): 'horizontal' | 'vertical' {
  if (rules.orientation !== 'auto') return rules.orientation
  let maxW = 0, maxH = 0
  for (const poly of buildable) {
    for (const ring of poly) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const [x, y] of ring) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      maxW = Math.max(maxW, maxX - minX)
      maxH = Math.max(maxH, maxY - minY)
    }
  }
  return maxW >= maxH ? 'horizontal' : 'vertical'
}

// ---------------------------------------------------------------------------
// Capacity pre-check
// ---------------------------------------------------------------------------

function capacityPreCheck(
  boothTypes: BoothType[],
  _rules: LayoutRules,
  _buildable: ReturnType<typeof computeBuildableRegion>,
  bands: Rect[],
): Problem | null {
  const totalRequiredBoothArea = boothTypes.reduce(
    (sum, t) => sum + t.width * t.depth * t.quantity,
    0,
  )
  const buildableArea = bands.reduce((sum, b) => sum + b.width * b.height, 0)
  // Conservative estimate: 35% of buildable is aisles
  const netAvailable = buildableArea * 0.65

  if (totalRequiredBoothArea > netAvailable) {
    const shortfallSqFt = Math.ceil((totalRequiredBoothArea - netAvailable) / 144)
    const totalSqFt = Math.round(buildableArea / 144)
    return {
      code: 'INSUFFICIENT_AREA',
      severity: 'error',
      message:
        `Requested booth area (${Math.round(totalRequiredBoothArea / 144).toLocaleString()} sq ft) ` +
        `exceeds estimated net available area (${Math.round(netAvailable / 144).toLocaleString()} sq ft) ` +
        `in a ${totalSqFt.toLocaleString()} sq ft hall. ` +
        `Shortfall: ${shortfallSqFt.toLocaleString()} sq ft.`,
      affectedBoothIds: [],
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortBoothTypes(types: BoothType[]): BoothType[] {
  return [...types].sort((a, b) => {
    if (a.style === 'island' && b.style !== 'island') return -1
    if (b.style === 'island' && a.style !== 'island') return 1
    if (a.priority !== b.priority) return a.priority - b.priority
    return b.depth - a.depth
  })
}

// ---------------------------------------------------------------------------
// Override application and reflow
// ---------------------------------------------------------------------------

function applyOverridesAndReflow(
  overrides: BoothOverride[],
  booths: PlacedBooth[],
  bands: Band[],
  problems: Problem[],
): PlacedBooth[] {
  if (overrides.length === 0) return booths

  const byId = new Map(booths.map(b => [b.id, b]))
  const affectedRowYs = new Set<number>()

  for (const ov of overrides) {
    const b = byId.get(ov.boothId)
    if (!b) continue  // orphaned override — booth not in this layout

    b.pinned = true

    if (ov.deleted) {
      byId.delete(ov.boothId)
      affectedRowYs.add(b.origin.y)
      continue
    }

    if (ov.typeId !== undefined) b.typeId = ov.typeId
    if (ov.status !== undefined) b.status = ov.status

    if (ov.width !== undefined && ov.width !== b.width) {
      b.width = ov.width
      affectedRowYs.add(b.origin.y)
    }
    if (ov.depth !== undefined && ov.depth !== b.depth) {
      b.depth = ov.depth
      // depth change affects row height — beyond scope of row-level reflow
    }
    if (ov.origin !== undefined) {
      const oldY = b.origin.y
      b.origin = { ...ov.origin }
      affectedRowYs.add(oldY)
      affectedRowYs.add(ov.origin.y)
    }
    if (ov.rotation !== undefined) b.rotation = ov.rotation
  }

  let result = [...byId.values()]
  for (const rowY of affectedRowYs) {
    const band = bands.find(bd => rowY >= bd.y && rowY < bd.y + bd.height)
    if (!band) continue
    result = reflowRow(result, rowY, band.x, band.width, problems)
  }

  return result
}

function reflowRow(
  booths: PlacedBooth[],
  rowY: number,
  bandX: number,
  bandWidth: number,
  problems: Problem[],
): PlacedBooth[] {
  const row = booths.filter(b => b.origin.y === rowY).sort((a, b) => a.origin.x - b.origin.x)
  const other = booths.filter(b => b.origin.y !== rowY)

  const result: PlacedBooth[] = []
  let cursor = bandX

  for (const b of row) {
    if (b.pinned) {
      if (b.origin.x < cursor) {
        problems.push({
          code: 'RUN_OVERFLOW',
          severity: 'warning',
          message: `Pinned booth overflows into adjacent space at x=${b.origin.x}.`,
          affectedBoothIds: [b.id],
        })
      }
      if (b.origin.x + b.width > bandX + bandWidth) {
        problems.push({
          code: 'RUN_OVERFLOW',
          severity: 'warning',
          message: `Pinned booth extends ${Math.round((b.origin.x + b.width - bandX - bandWidth) / 12)} ft past the band boundary.`,
          affectedBoothIds: [b.id],
        })
      }
      result.push(b)
      cursor = Math.max(cursor, b.origin.x + b.width)
    } else {
      // Shift non-pinned booth to fill from cursor
      if (cursor + b.width > bandX + bandWidth) continue  // drop, doesn't fit
      b.origin = { x: cursor, y: rowY }
      result.push(b)
      cursor += b.width
    }
  }

  return [...other, ...result]
}

function emptyResult(plan: ShowPlan, problems: Problem[]): LayoutResult {
  const placedCount: Record<string, number> = {}
  const unplacedCount: Record<string, number> = {}
  for (const t of plan.boothTypes) {
    placedCount[t.id] = 0
    unplacedCount[t.id] = t.quantity
  }
  return {
    booths: [],
    aisles: [],
    placedCount,
    unplacedCount,
    metrics: {
      totalPlaced: 0,
      perTypePlaced: placedCount,
      perTypeRequested: Object.fromEntries(plan.boothTypes.map(t => [t.id, t.quantity])),
      grossArea: 0,
      netSellableArea: 0,
      aisleArea: 0,
      deadSpace: 0,
      sellEfficiency: 0,
      estimatedRevenue: 0,
    },
    problems,
    suggestions: [],
  }
}
