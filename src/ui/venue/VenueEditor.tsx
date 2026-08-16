import { useState, useCallback } from 'react'
import { usePlanStore } from '../../store/planStore'
import VenueCanvas, { type DrawMode } from './VenueCanvas'
import VenueEditorPanel from './VenueEditorPanel'
import { orthSnap, rectPoly, GRID, dist } from './drawingUtils'
import type { Obstacle, Opening, Point } from '../../engine/types'

export default function VenueEditor() {
  const setView       = usePlanStore(s => s.setView)
  const plan          = usePlanStore(s => s.plan)
  const setOutline    = usePlanStore(s => s.setVenueOutline)
  const addObstacle   = usePlanStore(s => s.addObstacle)
  const addOpening    = usePlanStore(s => s.addOpening)
  const setScale      = usePlanStore(s => s.setVenueScale)
  const triggerFit    = usePlanStore(s => s.triggerFit)

  // Drawing state
  const [drawMode, setDrawMode] = useState<DrawMode>('view')
  const [draftOutline, setDraftOutline] = useState<Point[]>([])
  const [obsKind, setObsKind] = useState<Obstacle['kind']>('column')
  const [obsP1, setObsP1] = useState<Point | null>(null)
  const [openKind, setOpenKind] = useState<Opening['kind']>('loading-dock')
  const [openP1, setOpenP1] = useState<Point | null>(null)

  // Background image state (not in plan — binary data)
  const [bgImageEl, setBgImageEl] = useState<HTMLImageElement | null>(null)

  // Calibration state
  const [calStep, setCalStep] = useState<0 | 1 | 2>(0)
  const [calP1, setCalP1] = useState<Point | null>(null)
  const [calP2, setCalP2] = useState<Point | null>(null)
  const [calDistInput, setCalDistInput] = useState('')
  const calMode = drawMode === 'calibrating'

  // ---------------------------------------------------------------------------
  // Canvas click handler
  // ---------------------------------------------------------------------------
  const handleCanvasClick = useCallback((rawP: Point, closeRequested: boolean) => {

    if (drawMode === 'calibrating') {
      if (calStep === 0) { setCalP1(rawP); setCalStep(1) }
      else if (calStep === 1) { setCalP2(rawP); setCalStep(2) }
      return
    }

    if (drawMode === 'outline') {
      if (closeRequested && draftOutline.length >= 3) {
        // Close polygon
        setOutline(draftOutline)
        setDraftOutline([])
        setDrawMode('view')
        triggerFit()
        return
      }
      const prev = draftOutline.length > 0 ? draftOutline[draftOutline.length - 1] : null
      const p = prev ? orthSnap(prev, rawP) : rawP
      setDraftOutline(pts => [...pts, p])
      return
    }

    if (drawMode === 'obstacle') {
      if (!obsP1) {
        setObsP1(rawP)
      } else {
        const x = Math.min(obsP1.x, rawP.x), y = Math.min(obsP1.y, rawP.y)
        const w = Math.max(GRID, Math.abs(rawP.x - obsP1.x))
        const d = Math.max(GRID, Math.abs(rawP.y - obsP1.y))
        addObstacle({
          id: `obs-${Date.now()}`,
          kind: obsKind,
          polygon: rectPoly(x, y, w, d),
          buffer: 24,
        })
        setObsP1(null)
      }
      return
    }

    if (drawMode === 'opening') {
      if (!openP1) {
        setOpenP1(rawP)
      } else {
        addOpening({
          id: `open-${Date.now()}`,
          kind: openKind,
          segment: [openP1, rawP],
          clearDepth: 120,
        })
        setOpenP1(null)
      }
      return
    }
  }, [drawMode, draftOutline, obsKind, obsP1, openKind, openP1,
    setOutline, addObstacle, addOpening, calStep, triggerFit])

  // ---------------------------------------------------------------------------
  // Panel handlers
  // ---------------------------------------------------------------------------
  const handleCloseOutline = useCallback(() => {
    if (draftOutline.length >= 3) {
      setOutline(draftOutline)
      setDraftOutline([])
      setDrawMode('view')
      triggerFit()
    }
  }, [draftOutline, setOutline, triggerFit])

  const handleClearDraft = useCallback(() => {
    setDraftOutline([])
    setDrawMode('view')
    setObsP1(null)
    setOpenP1(null)
  }, [])

  const handleUploadImage = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setBgImageEl(img)
      URL.revokeObjectURL(url)
    }
    img.src = url
  }, [])

  const handleCalibrateStart = useCallback(() => {
    setDrawMode('calibrating')
    setCalStep(0)
    setCalP1(null)
    setCalP2(null)
    setCalDistInput('')
  }, [])

  const handleCalibrationConfirm = useCallback(() => {
    if (!calP1 || !calP2 || !bgImageEl) return
    const distFt = parseFloat(calDistInput)
    if (isNaN(distFt) || distFt <= 0) return
    const pxDist = dist(calP1, calP2)  // canvas units (= inches at current image scale)
    const pixelsPerInch = pxDist / (distFt * GRID)
    setScale(pixelsPerInch)
    setDrawMode('view')
    setCalStep(0)
    setCalP1(null)
    setCalP2(null)
  }, [calP1, calP2, calDistInput, bgImageEl, setScale])

  const handleSetDrawMode = useCallback((m: DrawMode) => {
    setDrawMode(m)
    setObsP1(null)
    setOpenP1(null)
  }, [])

  return (
    <div className="flex flex-col" style={{ height: '100dvh', background: '#0d1820' }}>
      {/* Header */}
      <header className="flex items-center gap-3 px-4 shrink-0"
        style={{ height: 44, background: '#131e28', borderBottom: '1px solid #1e2f3f' }}>
        <span style={{ color: '#4a90d9', fontWeight: 700, fontSize: 13,
          fontFamily: 'ui-monospace, monospace', letterSpacing: '0.04em' }}>
          FloorPlan
        </span>
        <span style={{ color: '#243344', userSelect: 'none' }}>·</span>
        <span style={{ color: '#7a9ab0', fontSize: 12 }}>Venue Editor</span>
        <span style={{ color: '#4a6070', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
          — {plan.venue.name || 'Unnamed Hall'}
        </span>

        <div style={{ marginLeft: 'auto' }}>
          <button type="button"
            onClick={() => { setView('layout'); triggerFit() }}
            className="rounded px-3 py-1 text-xs"
            style={{ background: '#1e3a5f', color: '#60a5fa',
              border: '1px solid #2a5078', cursor: 'pointer' }}>
            Layout View →
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <VenueEditorPanel
          drawMode={drawMode}
          obsKind={obsKind}
          openKind={openKind}
          onSetDrawMode={handleSetDrawMode}
          onSetObsKind={setObsKind}
          onSetOpenKind={setOpenKind}
          onCloseOutline={handleCloseOutline}
          onClearDraft={handleClearDraft}
          onUploadImage={handleUploadImage}
          onCalibrateStart={handleCalibrateStart}
          hasBgImage={bgImageEl !== null}
        />

        <VenueCanvas
          drawMode={drawMode}
          draftOutline={draftOutline}
          obsP1={obsP1}
          openP1={openP1}
          calStep={calStep}
          calP1={calP1}
          bgImageEl={bgImageEl}
          onCanvasClick={handleCanvasClick}
          onCursorMove={() => {}}
        />
      </div>

      {/* Calibration distance input overlay (shown after 2 points are selected) */}
      {calMode && calStep === 2 && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-lg p-6"
            style={{ background: '#1b2a38', border: '1px solid #243344', minWidth: 280 }}>
            <p style={{ color: '#c8d8e8', fontSize: 13, marginBottom: 12 }}>
              Real-world distance between selected points:
            </p>
            <div className="flex gap-2 items-center">
              <input type="number" min="0.1" step="0.5"
                value={calDistInput}
                onChange={e => setCalDistInput(e.target.value)}
                placeholder="Distance in feet"
                className="flex-1 rounded px-2 py-1 text-sm"
                style={{ background: '#0d1820', border: '1px solid #243344',
                  color: '#c8d8e8', outline: 'none' }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleCalibrationConfirm() }}
              />
              <button type="button" onClick={handleCalibrationConfirm}
                className="rounded px-3 py-1 text-xs"
                style={{ background: '#1e3a5f', color: '#60a5fa',
                  border: '1px solid #2a5078', cursor: 'pointer' }}>
                Set Scale
              </button>
            </div>
            <button type="button"
              onClick={() => { setDrawMode('view'); setCalStep(0) }}
              style={{ color: '#4a6070', fontSize: 11, background: 'none',
                border: 'none', cursor: 'pointer', marginTop: 8 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
