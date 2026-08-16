import { useRef, useState, useCallback, useEffect } from 'react'
import { Stage, Layer, Rect, Line, Circle, Text, Group, Image as KonvaImage } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { usePlanStore } from '../../store/planStore'
import { screenToCanvas, orthSnap, dist, CLOSE_RADIUS_PX, GRID, polyBBox } from './drawingUtils'
import type { Point } from '../../engine/types'

export type DrawMode = 'view' | 'outline' | 'obstacle' | 'opening' | 'calibrating'

interface Props {
  drawMode: DrawMode
  draftOutline: Point[]
  obsP1: Point | null
  openP1: Point | null
  calStep: 0 | 1 | 2
  calP1: Point | null
  bgImageEl: HTMLImageElement | null
  onCanvasClick: (p: Point, closeRequested: boolean) => void
  onCursorMove: (p: Point | null) => void
}

const OBSTACLE_COLORS: Record<string, string> = {
  column: '#78716c',
  wall: '#a8a29e',
  stage: '#7c3aed',
  'fixed-structure': '#92400e',
  reserved: '#0f766e',
}

const OPENING_COLORS: Record<string, string> = {
  entrance: '#22c55e',
  'fire-exit': '#ef4444',
  'loading-dock': '#f97316',
  service: '#6366f1',
}

export default function VenueCanvas({
  drawMode, draftOutline, obsP1, openP1, calStep, calP1,
  bgImageEl, onCanvasClick, onCursorMove,
}: Props) {
  const plan       = usePlanStore(s => s.plan)
  const fitTrigger = usePlanStore(s => s.viewFitTrigger)

  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [cursorCanvas, setCursorCanvas] = useState<Point | null>(null)

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ width: Math.floor(width), height: Math.floor(height) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const venue = plan.venue

  // ---------------------------------------------------------------------------
  // Fit to venue
  // ---------------------------------------------------------------------------
  const fitToView = useCallback(() => {
    const stage = stageRef.current
    const outline = venue.outline
    if (!stage || outline.length < 2) return
    const xs = outline.map(p => p.x), ys = outline.map(p => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const vW = maxX - minX || GRID * 100, vH = maxY - minY || GRID * 80
    const pad = 0.85
    const s = Math.min(size.width * pad / vW, size.height * pad / vH)
    stage.scale({ x: s, y: s })
    stage.position({
      x: (size.width  - vW * s) / 2 - minX * s,
      y: (size.height - vH * s) / 2 - minY * s,
    })
  }, [venue.outline, size])

  useEffect(() => { fitToView() }, [fitTrigger, fitToView])
  useEffect(() => { fitToView() }, [size]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Wheel zoom
  // ---------------------------------------------------------------------------
  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current!
    const old = stage.scaleX()
    const ptr = stage.getPointerPosition()!
    const f = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1
    const ns = Math.max(0.005, Math.min(20, old * f))
    const at = { x: (ptr.x - stage.x()) / old, y: (ptr.y - stage.y()) / old }
    stage.scale({ x: ns, y: ns })
    stage.position({ x: ptr.x - at.x * ns, y: ptr.y - at.y * ns })
  }, [])

  // ---------------------------------------------------------------------------
  // Pointer → canvas coordinate
  // ---------------------------------------------------------------------------
  const getCanvasPoint = useCallback((): Point | null => {
    const stage = stageRef.current
    const ptr = stage?.getPointerPosition()
    if (!stage || !ptr) return null
    return screenToCanvas(ptr.x, ptr.y, stage.x(), stage.y(), stage.scaleX())
  }, [])

  // ---------------------------------------------------------------------------
  // Mouse handlers
  // ---------------------------------------------------------------------------
  const handleMouseMove = useCallback(() => {
    const p = getCanvasPoint()
    setCursorCanvas(p)
    onCursorMove(p)
  }, [getCanvasPoint, onCursorMove])

  const handleClick = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (e.target !== e.target.getStage() && drawMode === 'view') return
    const p = getCanvasPoint()
    if (!p) return

    // Check if click is near first draft point (close polygon)
    const stage = stageRef.current!
    const scale = stage.scaleX()
    let closeRequested = false
    if (drawMode === 'outline' && draftOutline.length >= 3) {
      const first = draftOutline[0]
      const dPx = dist(
        { x: first.x * scale + stage.x(), y: first.y * scale + stage.y() },
        { x: stage.getPointerPosition()!.x, y: stage.getPointerPosition()!.y },
      )
      if (dPx < CLOSE_RADIUS_PX) closeRequested = true
    }
    onCanvasClick(p, closeRequested)
  }, [drawMode, draftOutline, getCanvasPoint, onCanvasClick])

  // ---------------------------------------------------------------------------
  // Derived drawing state
  // ---------------------------------------------------------------------------
  const prevPoint = draftOutline.length > 0 ? draftOutline[draftOutline.length - 1] : null
  const snappedCursor = cursorCanvas && prevPoint && drawMode === 'outline'
    ? orthSnap(prevPoint, cursorCanvas)
    : cursorCanvas

  const outlineFlat = venue.outline.flatMap(p => [p.x, p.y])
  const draftFlat = draftOutline.flatMap(p => [p.x, p.y])

  // Preview lines in obstacle mode (drag-like two-click)
  const obsPreview = obsP1 && snappedCursor && drawMode === 'obstacle'
    ? { x: Math.min(obsP1.x, snappedCursor.x), y: Math.min(obsP1.y, snappedCursor.y),
        w: Math.abs(snappedCursor.x - obsP1.x) || GRID,
        h: Math.abs(snappedCursor.y - obsP1.y) || GRID }
    : null

  const openPreview = openP1 && snappedCursor && drawMode === 'opening'
    ? [openP1.x, openP1.y, snappedCursor.x, snappedCursor.y]
    : null

  // bg image display
  const bgScale = venue.scale?.pixelsPerInch ?? null
  const bgW = bgImageEl && bgScale ? bgImageEl.naturalWidth / bgScale : 0
  const bgH = bgImageEl && bgScale ? bgImageEl.naturalHeight / bgScale : 0

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden"
      style={{ background: '#101820', cursor: drawMode !== 'view' ? 'crosshair' : 'default' }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        draggable={drawMode === 'view'}
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setCursorCanvas(null); onCursorMove(null) }}
        onClick={handleClick}
      >
        {/* Background image (traceable) */}
        {bgImageEl && bgScale && (
          <Layer listening={false}>
            <KonvaImage image={bgImageEl} x={0} y={0} width={bgW} height={bgH} opacity={0.35} />
          </Layer>
        )}

        {/* Venue shell */}
        <Layer listening={false}>
          {/* Perimeter setback boundary */}
          {outlineFlat.length >= 4 && (
            <>
              <Line points={outlineFlat} closed
                fill="rgba(74,144,217,0.07)" stroke="#2a5078"
                strokeWidth={1} strokeScaleEnabled={false} dash={[8, 6]} />
            </>
          )}

          {/* Obstacles */}
          {venue.obstacles.map(obs => {
            const bb = polyBBox(obs.polygon)
            const color = OBSTACLE_COLORS[obs.kind] ?? '#888'
            return (
              <Group key={obs.id}>
                <Rect x={bb.x - obs.buffer} y={bb.y - obs.buffer}
                  width={bb.w + obs.buffer * 2} height={bb.h + obs.buffer * 2}
                  fill="rgba(120,70,20,0.1)" stroke="#92400e"
                  strokeWidth={1} strokeScaleEnabled={false} dash={[4, 4]} />
                <Rect x={bb.x} y={bb.y} width={bb.w} height={bb.h}
                  fill={color} opacity={0.7} />
                {obs.label && (
                  <Text x={bb.x} y={bb.y} width={bb.w} height={bb.h}
                    text={obs.label} align="center" verticalAlign="middle"
                    fontSize={10} fill="#fff" listening={false} />
                )}
              </Group>
            )
          })}

          {/* Openings */}
          {venue.openings.map(op => {
            const [p1, p2] = op.segment
            const color = OPENING_COLORS[op.kind] ?? '#fff'
            return (
              <Group key={op.id}>
                <Line points={[p1.x, p1.y, p2.x, p2.y]}
                  stroke={color} strokeWidth={4} strokeScaleEnabled={false} />
                <Circle x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2}
                  radius={6} fill={color} opacity={0.8} />
              </Group>
            )
          })}
        </Layer>

        {/* Drawing overlays */}
        <Layer listening={false}>
          {/* Committed draft segments */}
          {draftFlat.length >= 4 && (
            <Line points={draftFlat} stroke="#4a90d9"
              strokeWidth={2} strokeScaleEnabled={false} />
          )}

          {/* Draft vertices */}
          {draftOutline.map((p, i) => (
            <Circle key={i} x={p.x} y={p.y} radius={4}
              fill={i === 0 ? '#22d3ee' : '#4a90d9'}
              stroke="#fff" strokeWidth={1} strokeScaleEnabled={false} />
          ))}

          {/* Preview line from last point to cursor */}
          {prevPoint && snappedCursor && drawMode === 'outline' && (
            <Line
              points={[prevPoint.x, prevPoint.y, snappedCursor.x, snappedCursor.y]}
              stroke="#4a90d9" strokeWidth={1} strokeScaleEnabled={false}
              dash={[4, 4]} opacity={0.7}
            />
          )}

          {/* Close indicator */}
          {draftOutline.length >= 3 && snappedCursor && drawMode === 'outline' &&
            draftOutline[0] && (() => {
              const stage = stageRef.current
              if (!stage) return null
              const sc = stage.scaleX()
              const first = draftOutline[0]
              const dPx = dist(
                { x: first.x * sc + stage.x(), y: first.y * sc + stage.y() },
                { x: (snappedCursor.x * sc + stage.x()), y: (snappedCursor.y * sc + stage.y()) },
              )
              if (dPx > CLOSE_RADIUS_PX * 2) return null
              return <Circle x={first.x} y={first.y} radius={CLOSE_RADIUS_PX / sc}
                stroke="#22d3ee" strokeWidth={2} strokeScaleEnabled={false} fill="transparent" />
            })()
          }

          {/* Obstacle preview rectangle */}
          {obsPreview && (
            <Rect x={obsPreview.x} y={obsPreview.y}
              width={obsPreview.w} height={obsPreview.h}
              fill="rgba(120,70,20,0.35)" stroke="#92400e"
              strokeWidth={2} strokeScaleEnabled={false} />
          )}
          {obsP1 && drawMode === 'obstacle' && (
            <Circle x={obsP1.x} y={obsP1.y} radius={4}
              fill="#f97316" strokeScaleEnabled={false} />
          )}

          {/* Opening preview line */}
          {openPreview && (
            <Line points={openPreview}
              stroke="#22c55e" strokeWidth={3} strokeScaleEnabled={false} />
          )}
          {openP1 && drawMode === 'opening' && (
            <Circle x={openP1.x} y={openP1.y} radius={4}
              fill="#22c55e" strokeScaleEnabled={false} />
          )}

          {/* Calibration points */}
          {calP1 && drawMode === 'calibrating' && (
            <Circle x={calP1.x} y={calP1.y} radius={5}
              fill="#f59e0b" stroke="#fff" strokeWidth={1} strokeScaleEnabled={false} />
          )}
        </Layer>
      </Stage>

      {/* Empty-state message */}
      {venue.outline.length === 0 && drawMode === 'view' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p style={{ color: '#4a6070', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
            Draw the hall outline, or enter its dimensions.
          </p>
        </div>
      )}

      {/* Mode indicator */}
      {drawMode !== 'view' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none">
          <span className="px-3 py-1 rounded text-xs"
            style={{ background: '#1b2a38', color: '#4a90d9', border: '1px solid #243344' }}>
            {drawMode === 'outline' && (draftOutline.length === 0
              ? 'Click to start polygon. Orthogonal snapping active.'
              : `${draftOutline.length} points — click near start to close`)}
            {drawMode === 'obstacle' && (obsP1
              ? 'Click second corner to place obstacle'
              : 'Click first corner of obstacle')}
            {drawMode === 'opening' && (openP1
              ? 'Click second point to place opening'
              : 'Click first point of opening')}
            {drawMode === 'calibrating' && (
              calStep === 0 ? 'Click first calibration point' :
              calStep === 1 ? 'Click second calibration point' :
              'Enter real-world distance'
            )}
          </span>
        </div>
      )}
    </div>
  )
}
