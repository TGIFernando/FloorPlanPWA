import type { Point } from '../../engine/types'

export const GRID = 12  // 1 foot in inches
export const CLOSE_RADIUS_PX = 16  // screen pixels to trigger polygon close

export function snapToGrid(v: number): number {
  return Math.round(v / GRID) * GRID
}

export function snapPoint(p: Point): Point {
  return { x: snapToGrid(p.x), y: snapToGrid(p.y) }
}

/** Force the next point to be on the same horizontal or vertical line as prev. */
export function orthSnap(prev: Point, curr: Point): Point {
  const dx = Math.abs(curr.x - prev.x)
  const dy = Math.abs(curr.y - prev.y)
  return dx >= dy ? { x: curr.x, y: prev.y } : { x: prev.x, y: curr.y }
}

export function dist(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/** Convert screen/stage coordinates to snapped canvas (inch) coordinates. */
export function screenToCanvas(
  screenX: number, screenY: number,
  stageX: number, stageY: number,
  scale: number,
): Point {
  return {
    x: snapToGrid((screenX - stageX) / scale),
    y: snapToGrid((screenY - stageY) / scale),
  }
}

/** Parse "x,y" pairs from textarea (one per line, values in feet). */
export function parsePointsText(text: string): Point[] | null {
  const lines = text.trim().split('\n').filter(l => l.trim())
  const points: Point[] = []
  for (const line of lines) {
    const parts = line.trim().split(/[\s,]+/)
    if (parts.length < 2) return null
    const x = parseFloat(parts[0])
    const y = parseFloat(parts[1])
    if (isNaN(x) || isNaN(y)) return null
    points.push({ x: snapToGrid(x * GRID), y: snapToGrid(y * GRID) })
  }
  return points.length >= 3 ? points : null
}

/** Build a rectangular polygon (4-point, clockwise). */
export function rectPoly(x: number, y: number, w: number, h: number): Point[] {
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
}

/** Bounding box of a polygon. */
export function polyBBox(pts: Point[]): { x: number; y: number; w: number; h: number } {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
