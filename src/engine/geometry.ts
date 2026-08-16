import type { Point, Inches, Rect } from './types'
import polygonClipping, { type Polygon, type MultiPolygon } from 'polygon-clipping'

// ---------------------------------------------------------------------------
// Basic rectangle helpers
// ---------------------------------------------------------------------------

export function rectContainsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function rectArea(r: Rect): number {
  return r.width * r.height
}

export function rectToPolygon(r: Rect): Polygon {
  const { x, y, width: w, height: h } = r
  return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]]
}

// ---------------------------------------------------------------------------
// Polygon ↔ engine type conversions
// ---------------------------------------------------------------------------

export function pointsToPolygon(pts: Point[]): Polygon {
  const ring = pts.map(p => [p.x, p.y] as [number, number])
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    ring.push([ring[0][0], ring[0][1]])
  }
  return [ring]
}

export function polygonBBox(poly: Polygon): Rect {
  const ring = poly[0]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
  }
}

// ---------------------------------------------------------------------------
// Inward polygon offset (shrink by `amount` on all sides)
// For convex, axis-aligned rectangles this is exact. For general polygons we
// use the bounding-box approximation which is good enough for setback.
// ---------------------------------------------------------------------------

export function insetRect(r: Rect, amount: Inches): Rect | null {
  const x = r.x + amount
  const y = r.y + amount
  const width = r.width - 2 * amount
  const height = r.height - 2 * amount
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

// ---------------------------------------------------------------------------
// Buildable-region computation
// ---------------------------------------------------------------------------

/**
 * Returns the buildable multi-polygon by:
 *   1. Starting with the venue outline (inset by perimeterSetback)
 *   2. Subtracting each obstacle inflated by its buffer
 *   3. Subtracting the clear rectangle in front of each opening
 */
export function computeBuildableRegion(
  outline: Point[],
  perimeterSetback: Inches,
  obstacles: Array<{ polygon: Point[]; buffer: Inches }>,
  openings: Array<{ segment: [Point, Point]; clearDepth: Inches }>,
): MultiPolygon {
  // Start with the venue outline
  let region: MultiPolygon = [pointsToPolygon(outline)]

  // Inset by perimeter setback using a rect approximation of the outline bbox
  const bbox = polygonBBox(region[0])
  const inset = insetRect(bbox, perimeterSetback)
  if (!inset) return []
  region = [rectToPolygon(inset)]

  // Subtract obstacles (each inflated by its buffer)
  for (const obs of obstacles) {
    const obsPoly = pointsToPolygon(obs.polygon)
    const obsBBox = polygonBBox(obsPoly)
    const inflated = {
      x: obsBBox.x - obs.buffer,
      y: obsBBox.y - obs.buffer,
      width: obsBBox.width + 2 * obs.buffer,
      height: obsBBox.height + 2 * obs.buffer,
    }
    const inflatedPoly: MultiPolygon = [rectToPolygon(inflated)]
    const result = polygonClipping.difference(
      region as Parameters<typeof polygonClipping.difference>[0],
      ...inflatedPoly as unknown as Parameters<typeof polygonClipping.difference>[1][],
    )
    region = result
    if (region.length === 0) return []
  }

  // Subtract clear zone in front of each opening
  for (const opening of openings) {
    const [a, b] = opening.segment
    const clearRect: Rect = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.max(Math.abs(b.x - a.x), 1),
      height: Math.max(Math.abs(b.y - a.y), opening.clearDepth),
    }
    const clearPoly: MultiPolygon = [rectToPolygon(clearRect)]
    const result = polygonClipping.difference(
      region as Parameters<typeof polygonClipping.difference>[0],
      ...clearPoly as unknown as Parameters<typeof polygonClipping.difference>[1][],
    )
    region = result
    if (region.length === 0) return []
  }

  return region
}

// ---------------------------------------------------------------------------
// Band decomposition
// ---------------------------------------------------------------------------

/**
 * Cuts the bounding box of the buildable multi-polygon into axis-aligned
 * rectangular bands along the given orientation. Each polygon in the multi-
 * polygon produces its own band set; duplicate or overlapping bands are merged.
 *
 * 'horizontal' → bands run left-to-right (rows are horizontal strips)
 * 'vertical'   → bands run top-to-bottom (rows are vertical strips)
 */
export function decomposeToBands(
  region: MultiPolygon,
  orientation: 'horizontal' | 'vertical',
): Rect[] {
  const bands: Rect[] = []

  for (const poly of region) {
    const bbox = polygonBBox(poly)
    // For now we treat each polygon's bbox as one band.
    // A future upgrade can do proper horizontal/vertical slice decomposition
    // for L-shaped and other complex outlines.
    bands.push(bbox)
  }

  // Merge bands that share the full perpendicular extent
  return mergeBands(bands, orientation)
}

function mergeBands(bands: Rect[], orientation: 'horizontal' | 'vertical'): Rect[] {
  if (bands.length <= 1) return bands

  if (orientation === 'horizontal') {
    // Sort by y, merge bands with the same x/width/height
    const sorted = [...bands].sort((a, b) => a.y - b.y || a.x - b.x)
    const merged: Rect[] = []
    for (const b of sorted) {
      const last = merged[merged.length - 1]
      if (last && last.x === b.x && last.width === b.width && last.y + last.height === b.y) {
        last.height += b.height
      } else {
        merged.push({ ...b })
      }
    }
    return merged
  } else {
    const sorted = [...bands].sort((a, b) => a.x - b.x || a.y - b.y)
    const merged: Rect[] = []
    for (const b of sorted) {
      const last = merged[merged.length - 1]
      if (last && last.y === b.y && last.height === b.height && last.x + last.width === b.x) {
        last.width += b.width
      } else {
        merged.push({ ...b })
      }
    }
    return merged
  }
}

// ---------------------------------------------------------------------------
// Aisle / face detection helpers
// ---------------------------------------------------------------------------

/** Returns true if `seg` lies along one edge of `booth`. */
export function edgeTouchesRect(
  boothX: Inches, boothY: Inches, boothW: Inches, boothD: Inches,
  aisleRect: Rect,
  face: 'north' | 'south' | 'east' | 'west',
): boolean {
  switch (face) {
    case 'north':
      return (
        boothY === aisleRect.y + aisleRect.height &&
        boothX < aisleRect.x + aisleRect.width &&
        boothX + boothW > aisleRect.x
      )
    case 'south':
      return (
        boothY + boothD === aisleRect.y &&
        boothX < aisleRect.x + aisleRect.width &&
        boothX + boothW > aisleRect.x
      )
    case 'east':
      return (
        boothX + boothW === aisleRect.x &&
        boothY < aisleRect.y + aisleRect.height &&
        boothY + boothD > aisleRect.y
      )
    case 'west':
      return (
        boothX === aisleRect.x + aisleRect.width &&
        boothY < aisleRect.y + aisleRect.height &&
        boothY + boothD > aisleRect.y
      )
  }
}
