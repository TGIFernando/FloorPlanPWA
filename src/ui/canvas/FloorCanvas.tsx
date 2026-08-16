import { useEffect, useRef, useState, useCallback } from 'react'
import { Stage, Layer, Rect, Line, Text, Group } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { usePlanStore } from '../../store/planStore'
import ContextMenu from '../panels/ContextMenu'

const GRID = 12  // 1 foot in inches

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function FloorCanvas() {
  const plan         = usePlanStore(s => s.plan)
  const result       = usePlanStore(s => s.layoutResult)
  const selectedIds  = usePlanStore(s => s.selectedIds)
  const overlays     = usePlanStore(s => s.showOverlays)
  const fitTrigger   = usePlanStore(s => s.viewFitTrigger)
  const isGenerating = usePlanStore(s => s.isGenerating)
  const movedIds     = usePlanStore(s => s.movedBoothIds)
  const contextMenu  = usePlanStore(s => s.contextMenu)
  const toggleSelect    = usePlanStore(s => s.toggleSelect)
  const clearSelection  = usePlanStore(s => s.clearSelection)
  const showContextMenu = usePlanStore(s => s.showContextMenu)
  const hideContextMenu = usePlanStore(s => s.hideContextMenu)
  const moveBooth       = usePlanStore(s => s.moveBooth)
  const resizeBooth     = usePlanStore(s => s.resizeBooth)

  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const stageRef = useRef<Konva.Stage>(null)

  // Track drag start to suppress click-after-drag
  const isDraggingBooth = useRef(false)

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

  const typeColors = new Map(plan.boothTypes.map(t => [t.id, t.color]))
  const selectedSet = new Set(selectedIds)
  const movedSet = new Set(movedIds)

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

  useEffect(() => { if (result) fitToView() }, [fitTrigger, result]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fitToView() }, [size]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Wheel zoom
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
  // Keyboard: arrow nudge, Ctrl+Z/Y
  // ---------------------------------------------------------------------------
  const undo = usePlanStore(s => s.undo)
  const redo = usePlanStore(s => s.redo)
  const canUndo = usePlanStore(s => s.canUndo)
  const canRedo = usePlanStore(s => s.canRedo)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      if (canUndo) undo()
      return
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault()
      if (canRedo) redo()
      return
    }
    if (selectedIds.length !== 1) return
    const boothId = selectedIds[0]
    const booth = result?.booths.find(b => b.id === boothId)
    if (!booth) return

    let dx = 0, dy = 0
    if (e.key === 'ArrowLeft')  { dx = -GRID; e.preventDefault() }
    if (e.key === 'ArrowRight') { dx =  GRID; e.preventDefault() }
    if (e.key === 'ArrowUp')    { dy = -GRID; e.preventDefault() }
    if (e.key === 'ArrowDown')  { dy =  GRID; e.preventDefault() }
    if (dx === 0 && dy === 0) return
    moveBooth(boothId, { x: booth.origin.x + dx, y: booth.origin.y + dy })
  }, [selectedIds, result, moveBooth, undo, redo, canUndo, canRedo])

  // ---------------------------------------------------------------------------
  // Drag snap helper
  // ---------------------------------------------------------------------------
  const makeDragBound = useCallback((
    initOriginX: number,
    initOriginY: number,
  ) => (pos: { x: number; y: number }) => {
    const stage = stageRef.current!
    const scale = stage.scaleX()
    const sx = stage.x(), sy = stage.y()
    // pos is in screen coords (absolute); convert to canvas coords
    const cx = (pos.x - sx) / scale
    const cy = (pos.y - sy) / scale
    const snappedCx = Math.round(cx / GRID) * GRID
    const snappedCy = Math.round(cy / GRID) * GRID
    // Clamp within venue bounds
    const outline = plan.venue.outline
    const minX = Math.min(...outline.map(p => p.x))
    const minY = Math.min(...outline.map(p => p.y))
    const maxX = Math.max(...outline.map(p => p.x))
    const maxY = Math.max(...outline.map(p => p.y))
    const clampedCx = Math.max(minX, Math.min(maxX - GRID, snappedCx))
    const clampedCy = Math.max(minY, Math.min(maxY - GRID, snappedCy))
    // Convert back to screen coords
    return {
      x: clampedCx * scale + sx,
      y: clampedCy * scale + sy,
    }
    void initOriginX; void initOriginY
  }, [plan.venue.outline])

  const outlinePoints = plan.venue.outline.flatMap(p => [p.x, p.y])
  const singleSelected = selectedIds.length === 1 ? result?.booths.find(b => b.id === selectedIds[0]) : undefined

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden outline-none"
      style={{ background: '#151f27' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={hideContextMenu}
    >
      {/* Generating indicator */}
      {isGenerating && (
        <div className="absolute top-0 left-0 right-0 z-10 h-0.5"
          style={{ background: '#3a82f6', opacity: 0.8 }} />
      )}

      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        draggable
        onWheel={handleWheel}
        onClick={(e) => {
          if (e.target === e.target.getStage()) {
            clearSelection()
            hideContextMenu()
          }
        }}
        onContextMenu={(e) => { e.evt.preventDefault() }}
      >
        {/* Venue outline */}
        <Layer listening={false}>
          {outlinePoints.length >= 4 && (
            <Line points={outlinePoints} closed
              fill="rgba(255,255,255,0.03)" stroke="#2a4055"
              strokeWidth={2} strokeScaleEnabled={false} />
          )}
        </Layer>

        {/* Aisles */}
        {overlays.aisles && result && (
          <Layer listening={false}>
            {result.aisles.map((a, i) => (
              <Rect key={i} x={a.x} y={a.y} width={a.width} height={a.height}
                fill="rgba(18, 28, 36, 0.55)" />
            ))}
          </Layer>
        )}

        {/* Booths */}
        {result && (
          <Layer>
            {result.booths.map(booth => {
              const color = typeColors.get(booth.typeId) ?? '#4a90d9'
              const isSelected = selectedSet.has(booth.id)
              const isMoved = movedSet.has(booth.id)
              const isPinned = booth.pinned

              const fillColor = isMoved
                ? hexToRgba('#f59e0b', 0.9)
                : isSelected
                  ? hexToRgba(color, 0.95)
                  : booth.status === 'sold'
                    ? hexToRgba('#16a34a', 0.82)
                    : booth.status === 'held'
                      ? hexToRgba('#9333ea', 0.82)
                      : hexToRgba(color, 0.82)

              const strokeColor = isSelected ? '#3a82f6' : isMoved ? '#f59e0b' : '#0d1820'
              const strokeWidth = isSelected || isMoved ? 3 : 1

              return (
                <Group
                  key={booth.id}
                  x={booth.origin.x}
                  y={booth.origin.y}
                  draggable
                  dragBoundFunc={makeDragBound(booth.origin.x, booth.origin.y)}
                  onDragStart={() => { isDraggingBooth.current = true }}
                  onDragEnd={(e) => {
                    const node = e.target as Konva.Node
                    const newX = Math.round(node.x() / GRID) * GRID
                    const newY = Math.round(node.y() / GRID) * GRID
                    setTimeout(() => { isDraggingBooth.current = false }, 0)
                    moveBooth(booth.id, { x: newX, y: newY })
                  }}
                  onClick={(e) => {
                    if (isDraggingBooth.current) return
                    e.cancelBubble = true
                    hideContextMenu()
                    toggleSelect(booth.id, e.evt.shiftKey)
                  }}
                  onContextMenu={(e) => {
                    e.evt.preventDefault()
                    e.cancelBubble = true
                    toggleSelect(booth.id, false)
                    showContextMenu({
                      boothId: booth.id,
                      screenX: e.evt.clientX,
                      screenY: e.evt.clientY,
                    })
                  }}
                >
                  <Rect
                    x={0} y={0}
                    width={booth.width} height={booth.depth}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeScaleEnabled={false}
                  />
                  {/* Pin indicator */}
                  {isPinned && (
                    <Rect x={0} y={0} width={6} height={6} fill="#f59e0b" listening={false} />
                  )}
                  {overlays.numbers && (
                    <Text
                      x={0} y={0}
                      width={booth.width} height={booth.depth}
                      text={booth.number}
                      align="center" verticalAlign="middle"
                      fontSize={10}
                      fontFamily="ui-monospace, Consolas, monospace"
                      fill={isSelected ? '#ffffff' : 'rgba(255,255,255,0.85)'}
                      listening={false}
                    />
                  )}
                </Group>
              )
            })}

            {/* Resize handle for single selected booth */}
            {singleSelected && (() => {
              const b = singleSelected
              const HANDLE = 10
              return (
                <Rect
                  key={`resize-${b.id}`}
                  x={b.origin.x + b.width - HANDLE / 2}
                  y={b.origin.y + b.depth / 2 - HANDLE / 2}
                  width={HANDLE}
                  height={HANDLE}
                  fill="#f97316"
                  stroke="#fff"
                  strokeWidth={1}
                  strokeScaleEnabled={false}
                  draggable
                  dragBoundFunc={(pos) => {
                    // Lock Y, snap X
                    const stage = stageRef.current!
                    const scale = stage.scaleX()
                    const sx = stage.x()
                    const sy = stage.y()
                    const screenOriginX = b.origin.x * scale + sx
                    const cx = (pos.x - sx) / scale
                    const snapped = Math.max(b.origin.x + GRID, Math.round(cx / GRID) * GRID)
                    return {
                      x: snapped * scale + sx - (HANDLE / 2) * scale,
                      y: (b.origin.y + b.depth / 2 - HANDLE / 2) * scale + sy,
                    }
                    void screenOriginX
                  }}
                  onDragEnd={(e) => {
                    const stage = stageRef.current!
                    const scale = stage.scaleX()
                    const sx = stage.x()
                    const sy = stage.y()
                    const handleScreenX = e.target.absolutePosition().x + (HANDLE / 2) * scale
                    const newEdge = Math.round((handleScreenX - sx) / scale / GRID) * GRID
                    const newWidth = Math.max(GRID, newEdge - b.origin.x)
                    e.target.absolutePosition({
                      x: (b.origin.x + newWidth - HANDLE / 2) * scale + sx,
                      y: (b.origin.y + b.depth / 2 - HANDLE / 2) * scale + sy,
                    })
                    resizeBooth(b.id, newWidth)
                  }}
                />
              )
            })()}
          </Layer>
        )}
      </Stage>

      {/* Empty state */}
      {!result && !isGenerating && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p style={{ color: '#4a6070', fontFamily: 'ui-monospace, monospace', fontSize: 14 }}>
            Draw the hall outline, or enter its dimensions.
          </p>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && <ContextMenu />}
    </div>
  )
}
