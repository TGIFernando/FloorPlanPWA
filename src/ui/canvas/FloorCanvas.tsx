import { useEffect, useRef, useState, useCallback } from 'react'
import { Stage, Layer, Rect, Line, Text, Group } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { usePlanStore } from '../../store/planStore'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ---------------------------------------------------------------------------
// FloorCanvas
// ---------------------------------------------------------------------------
export default function FloorCanvas() {
  const plan        = usePlanStore(s => s.plan)
  const result      = usePlanStore(s => s.layoutResult)
  const selectedIds = usePlanStore(s => s.selectedIds)
  const overlays    = usePlanStore(s => s.showOverlays)
  const fitTrigger  = usePlanStore(s => s.viewFitTrigger)
  const isGenerating = usePlanStore(s => s.isGenerating)
  const toggleSelect = usePlanStore(s => s.toggleSelect)
  const clearSelection = usePlanStore(s => s.clearSelection)

  // Canvas container size
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ width: Math.floor(width), height: Math.floor(height) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Konva stage ref
  const stageRef = useRef<Konva.Stage>(null)

  // Colour lookup: typeId → hex colour
  const typeColors = new Map(plan.boothTypes.map(t => [t.id, t.color]))
  const selectedSet = new Set(selectedIds)

  // ---------------------------------------------------------------------------
  // Fit to view
  // ---------------------------------------------------------------------------
  const fitToView = useCallback(() => {
    const stage = stageRef.current
    if (!stage || !result) return
    const outline = plan.venue.outline
    const xs = outline.map(p => p.x)
    const ys = outline.map(p => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const vW = maxX - minX, vH = maxY - minY

    const padding = 0.88
    const s = Math.min(size.width * padding / vW, size.height * padding / vH)
    stage.scale({ x: s, y: s })
    stage.position({
      x: (size.width  - vW * s) / 2 - minX * s,
      y: (size.height - vH * s) / 2 - minY * s,
    })
  }, [plan.venue.outline, result, size])

  // Fit whenever fitTrigger increments or result first arrives
  useEffect(() => {
    if (result) fitToView()
  }, [fitTrigger, result]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resize: re-fit to keep the hall centred
  useEffect(() => {
    fitToView()
  }, [size]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Wheel zoom (zoom to cursor)
  // ---------------------------------------------------------------------------
  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current!
    const oldScale = stage.scaleX()
    const pointer = stage.getPointerPosition()!
    const factor = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1
    const newScale = Math.max(0.01, Math.min(20, oldScale * factor))
    const mouseAt = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale }
    stage.scale({ x: newScale, y: newScale })
    stage.position({ x: pointer.x - mouseAt.x * newScale, y: pointer.y - mouseAt.y * newScale })
  }, [])

  // ---------------------------------------------------------------------------
  // Venue outline (Line)
  // ---------------------------------------------------------------------------
  const outlinePoints = plan.venue.outline.flatMap(p => [p.x, p.y])

  // ---------------------------------------------------------------------------
  // Grid (background squares — only drawn when zoomed in enough)
  // ---------------------------------------------------------------------------
  // Not drawn in a Konva Layer to keep it simple; the canvas bg colour is enough.

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden"
      style={{ background: '#151f27' }}
    >
      {/* Thin generating indicator bar at top */}
      {isGenerating && (
        <div
          className="absolute top-0 left-0 right-0 z-10 h-0.5"
          style={{ background: '#3a82f6', opacity: 0.8 }}
        />
      )}

      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        draggable
        onWheel={handleWheel}
        onClick={(e) => {
          // Click on Stage background → clear selection
          if (e.target === e.target.getStage()) clearSelection()
        }}
      >
        {/* Venue outline layer */}
        <Layer listening={false}>
          {outlinePoints.length >= 4 && (
            <Line
              points={outlinePoints}
              closed
              fill="rgba(255,255,255,0.03)"
              stroke="#2a4055"
              strokeWidth={2}
              strokeScaleEnabled={false}
            />
          )}
        </Layer>

        {/* Aisle layer */}
        {overlays.aisles && result && (
          <Layer listening={false}>
            {result.aisles.map((a, i) => (
              <Rect
                key={i}
                x={a.x} y={a.y}
                width={a.width} height={a.height}
                fill="rgba(18, 28, 36, 0.55)"
              />
            ))}
          </Layer>
        )}

        {/* Booth layer */}
        {result && (
          <Layer>
            {result.booths.map(booth => {
              const color = typeColors.get(booth.typeId) ?? '#4a90d9'
              const isSelected = selectedSet.has(booth.id)
              return (
                <Group
                  key={booth.id}
                  onClick={(e) => {
                    e.cancelBubble = true
                    toggleSelect(booth.id, e.evt.shiftKey)
                  }}
                >
                  <Rect
                    x={booth.origin.x}
                    y={booth.origin.y}
                    width={booth.width}
                    height={booth.depth}
                    fill={isSelected ? hexToRgba(color, 0.95) : hexToRgba(color, 0.82)}
                    stroke={isSelected ? '#3a82f6' : '#0d1820'}
                    strokeWidth={isSelected ? 3 : 1}
                    strokeScaleEnabled={false}
                  />
                  {overlays.numbers && (
                    <Text
                      x={booth.origin.x}
                      y={booth.origin.y}
                      width={booth.width}
                      height={booth.depth}
                      text={booth.number}
                      align="center"
                      verticalAlign="middle"
                      fontSize={10}
                      fontFamily="ui-monospace, Consolas, monospace"
                      fill={isSelected ? '#ffffff' : 'rgba(255,255,255,0.85)'}
                      listening={false}
                    />
                  )}
                </Group>
              )
            })}
          </Layer>
        )}
      </Stage>

      {/* Empty-state message */}
      {!result && !isGenerating && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p style={{ color: '#4a6070', fontFamily: 'ui-monospace, monospace', fontSize: 14 }}>
            Draw the hall outline, or enter its dimensions.
          </p>
        </div>
      )}
    </div>
  )
}
