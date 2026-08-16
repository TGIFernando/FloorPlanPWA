import { useState } from 'react'
import { usePlanStore } from '../../store/planStore'
import { GRID, parsePointsText, rectPoly, polyBBox } from './drawingUtils'
import type { DrawMode } from './VenueCanvas'
import type { Obstacle, Opening } from '../../engine/types'

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ color: '#7a9ab0', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {children}
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p style={{ color: '#4a90d9', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
        marginBottom: 8, fontWeight: 600 }}>{title}</p>
      {children}
    </div>
  )
}

function Input({ value, onChange, type = 'text', placeholder, min, step }:
  { value: string; onChange: (v: string) => void; type?: string; placeholder?: string; min?: string; step?: string }) {
  return (
    <input type={type} value={value} placeholder={placeholder} min={min} step={step}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded px-2 py-1 text-xs"
      style={{ background: '#0d1820', border: '1px solid #243344', color: '#c8d8e8',
        fontFamily: 'ui-monospace, monospace', outline: 'none' }} />
  )
}

function Btn({ label, onClick, disabled, accent, danger }:
  { label: string; onClick: () => void; disabled?: boolean; accent?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="rounded px-2.5 py-1 text-xs w-full"
      style={{
        background: danger ? '#4c1a1a' : accent ? '#1e3a5f' : '#1b2a38',
        color: disabled ? '#2a3f52' : danger ? '#f87171' : accent ? '#60a5fa' : '#7a9ab0',
        border: `1px solid ${disabled ? '#1e2f3f' : danger ? '#7f1d1d' : accent ? '#2a5078' : '#243344'}`,
        cursor: disabled ? 'default' : 'pointer',
      }}>
      {label}
    </button>
  )
}

interface Props {
  drawMode: DrawMode
  obsKind: Obstacle['kind']
  openKind: Opening['kind']
  onSetDrawMode: (m: DrawMode) => void
  onSetObsKind: (k: Obstacle['kind']) => void
  onSetOpenKind: (k: Opening['kind']) => void
  onCloseOutline: () => void
  onClearDraft: () => void
  onUploadImage: (file: File) => void
  onCalibrateStart: () => void
  hasBgImage: boolean
}

const OBS_KINDS: Obstacle['kind'][] = ['column', 'wall', 'stage', 'fixed-structure', 'reserved']
const OPEN_KINDS: Opening['kind'][] = ['entrance', 'fire-exit', 'loading-dock', 'service']

export default function VenueEditorPanel({
  drawMode, obsKind, openKind,
  onSetDrawMode, onSetObsKind, onSetOpenKind,
  onCloseOutline, onClearDraft, onUploadImage, onCalibrateStart, hasBgImage,
}: Props) {
  const venue          = usePlanStore(s => s.plan.venue)
  const setOutline     = usePlanStore(s => s.setVenueOutline)
  const setSetback     = usePlanStore(s => s.setVenueSetback)
  const setVenueName   = usePlanStore(s => s.setVenueName)
  const addObstacle    = usePlanStore(s => s.addObstacle)
  const removeObstacle = usePlanStore(s => s.removeObstacle)
  const addOpening     = usePlanStore(s => s.addOpening)
  const removeOpening  = usePlanStore(s => s.removeOpening)

  // Rectangle shortcut
  const [rectW, setRectW] = useState('')
  const [rectD, setRectD] = useState('')

  // Custom polygon textarea
  const [polyText, setPolyText] = useState('')
  const [polyError, setPolyError] = useState('')

  // Obstacle form
  const [obsLabel, setObsLabel] = useState('')
  const [obsX, setObsX] = useState('')
  const [obsY, setObsY] = useState('')
  const [obsW, setObsW] = useState('3')
  const [obsD, setObsD] = useState('3')
  const [obsBuf, setObsBuf] = useState('2')

  // Opening form
  const [openX1, setOpenX1] = useState('')
  const [openY1, setOpenY1] = useState('')
  const [openX2, setOpenX2] = useState('')
  const [openY2, setOpenY2] = useState('')
  const [openDepth, setOpenDepth] = useState('10')

  const ft = (v: string) => parseFloat(v) * GRID  // feet → inches

  function applyRect() {
    const w = ft(rectW), d = ft(rectD)
    if (!w || !d || w <= 0 || d <= 0) return
    setOutline(rectPoly(0, 0, w, d))
  }

  function applyPoly() {
    const pts = parsePointsText(polyText)
    if (!pts) { setPolyError('Need ≥3 valid "x,y" lines (in feet)'); return }
    setPolyError('')
    setOutline(pts)
  }

  function submitObstacle() {
    const x = ft(obsX), y = ft(obsY), w = ft(obsW), d = ft(obsD), buf = ft(obsBuf)
    if (isNaN(x) || isNaN(y) || !w || !d) return
    addObstacle({
      id: `obs-${Date.now()}`,
      kind: obsKind,
      polygon: rectPoly(x, y, w, d),
      label: obsLabel || undefined,
      buffer: isNaN(buf) ? 24 : Math.round(buf),
    })
    setObsX(''); setObsY('')
  }

  function submitOpening() {
    const x1 = ft(openX1), y1 = ft(openY1)
    const x2 = ft(openX2), y2 = ft(openY2)
    const depth = ft(openDepth)
    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return
    addOpening({
      id: `open-${Date.now()}`,
      kind: openKind,
      segment: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
      clearDepth: isNaN(depth) ? 120 : Math.round(depth),
    })
    setOpenX1(''); setOpenY1(''); setOpenX2(''); setOpenY2('')
  }

  const modeBtn = (m: DrawMode, label: string) => (
    <button type="button" onClick={() => onSetDrawMode(drawMode === m ? 'view' : m)}
      className="flex-1 py-1 rounded text-xs"
      style={{
        background: drawMode === m ? '#3a82f6' : '#243344',
        color: drawMode === m ? '#fff' : '#7a9ab0',
        border: 'none', cursor: 'pointer',
      }}>
      {label}
    </button>
  )

  return (
    <aside className="flex flex-col overflow-y-auto"
      style={{ width: 272, flexShrink: 0, background: '#1b2a38',
        borderRight: '1px solid #243344', padding: '16px 14px' }}>

      {/* Venue name */}
      <Section title="Hall">
        <div className="mb-2">
          <Label>Name</Label>
          <Input value={venue.name}
            onChange={v => setVenueName(v)}
            placeholder="Main Hall" />
        </div>
        <div className="mb-2">
          <Label>Perimeter setback</Label>
          <div className="flex items-center gap-2 mt-1">
            <input type="range" min={0} max={240} step={12}
              value={venue.perimeterSetback}
              onChange={e => setSetback(Number(e.target.value))}
              className="flex-1 accent-blue-500" style={{ height: 4 }} />
            <span style={{ color: '#c8d8e8', fontSize: 11, fontFamily: 'ui-monospace, monospace',
              minWidth: 36 }}>
              {Math.round(venue.perimeterSetback / 12)} ft
            </span>
          </div>
        </div>
      </Section>

      {/* Rectangle shortcut */}
      <Section title="Dimensions">
        <div className="mb-2">
          <Label>Quick rectangle (ft)</Label>
          <div className="flex gap-1 mt-1">
            <Input value={rectW} onChange={setRectW} type="number" placeholder="W" min="1" />
            <span style={{ color: '#4a6070', fontSize: 14, alignSelf: 'center' }}>×</span>
            <Input value={rectD} onChange={setRectD} type="number" placeholder="D" min="1" />
          </div>
          <div className="mt-1">
            <Btn label="Set rectangle" onClick={applyRect}
              disabled={!rectW || !rectD} accent />
          </div>
        </div>

        <div>
          <Label>Custom polygon (x,y per line, in ft)</Label>
          <textarea
            value={polyText} onChange={e => setPolyText(e.target.value)}
            placeholder={'0,0\n120,0\n120,80\n80,80\n80,40\n0,40'}
            rows={6}
            className="w-full rounded px-2 py-1 text-xs mt-1"
            style={{ background: '#0d1820', border: '1px solid #243344',
              color: '#c8d8e8', fontFamily: 'ui-monospace, monospace',
              resize: 'vertical', outline: 'none' }} />
          {polyError && (
            <p style={{ color: '#f87171', fontSize: 10, marginTop: 2 }}>{polyError}</p>
          )}
          <div className="mt-1"><Btn label="Apply polygon" onClick={applyPoly} accent /></div>
        </div>
      </Section>

      {/* Drawing modes */}
      <Section title="Draw mode">
        <div className="flex gap-1 mb-2">
          {modeBtn('outline', 'Outline')}
          {modeBtn('obstacle', 'Obstacle')}
          {modeBtn('opening', 'Opening')}
        </div>
        {drawMode === 'outline' && (
          <div className="flex gap-1">
            <Btn label="Close outline" onClick={onCloseOutline} accent
              disabled={drawMode !== 'outline'} />
            <Btn label="Cancel" onClick={onClearDraft} />
          </div>
        )}
      </Section>

      {/* Obstacle config + form */}
      <Section title="Obstacle">
        <div className="mb-2">
          <Label>Type</Label>
          <select value={obsKind} onChange={e => onSetObsKind(e.target.value as Obstacle['kind'])}
            className="w-full rounded px-2 py-1 text-xs mt-1"
            style={{ background: '#0d1820', border: '1px solid #243344',
              color: '#c8d8e8', outline: 'none' }}>
            {OBS_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="mb-1"><Label>Label (optional)</Label>
          <Input value={obsLabel} onChange={setObsLabel} placeholder="C-1" /></div>
        <div className="flex gap-1 mb-1">
          <div className="flex-1"><Label>X (ft)</Label>
            <Input value={obsX} onChange={setObsX} type="number" placeholder="0" /></div>
          <div className="flex-1"><Label>Y (ft)</Label>
            <Input value={obsY} onChange={setObsY} type="number" placeholder="0" /></div>
        </div>
        <div className="flex gap-1 mb-1">
          <div className="flex-1"><Label>W (ft)</Label>
            <Input value={obsW} onChange={setObsW} type="number" placeholder="3" min="1" /></div>
          <div className="flex-1"><Label>D (ft)</Label>
            <Input value={obsD} onChange={setObsD} type="number" placeholder="3" min="1" /></div>
        </div>
        <div className="mb-2"><Label>Buffer (ft)</Label>
          <Input value={obsBuf} onChange={setObsBuf} type="number" placeholder="2" /></div>
        <Btn label="Add obstacle" onClick={submitObstacle}
          disabled={!obsX || !obsY} accent />

        {/* Obstacle list */}
        {venue.obstacles.length > 0 && (
          <div className="mt-3">
            {venue.obstacles.map(obs => {
              const bb = polyBBox(obs.polygon)
              return (
                <div key={obs.id} className="flex items-center justify-between mb-1"
                  style={{ background: '#0d1820', borderRadius: 4, padding: '4px 8px' }}>
                  <span style={{ color: '#c8d8e8', fontSize: 11 }}>
                    {obs.label || obs.kind} — {Math.round(bb.w / GRID)}×{Math.round(bb.h / GRID)} ft
                    @ ({Math.round(bb.x / GRID)},{Math.round(bb.y / GRID)})
                  </span>
                  <button type="button" onClick={() => removeObstacle(obs.id)}
                    style={{ color: '#f87171', fontSize: 11, background: 'none',
                      border: 'none', cursor: 'pointer', paddingLeft: 8 }}>✕</button>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Opening config + form */}
      <Section title="Opening">
        <div className="mb-2">
          <Label>Kind</Label>
          <select value={openKind} onChange={e => onSetOpenKind(e.target.value as Opening['kind'])}
            className="w-full rounded px-2 py-1 text-xs mt-1"
            style={{ background: '#0d1820', border: '1px solid #243344',
              color: '#c8d8e8', outline: 'none' }}>
            {OPEN_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="flex gap-1 mb-1">
          <div className="flex-1"><Label>P1 X (ft)</Label>
            <Input value={openX1} onChange={setOpenX1} type="number" placeholder="0" /></div>
          <div className="flex-1"><Label>P1 Y (ft)</Label>
            <Input value={openY1} onChange={setOpenY1} type="number" placeholder="0" /></div>
        </div>
        <div className="flex gap-1 mb-1">
          <div className="flex-1"><Label>P2 X (ft)</Label>
            <Input value={openX2} onChange={setOpenX2} type="number" placeholder="10" /></div>
          <div className="flex-1"><Label>P2 Y (ft)</Label>
            <Input value={openY2} onChange={setOpenY2} type="number" placeholder="0" /></div>
        </div>
        <div className="mb-2"><Label>Clear depth (ft)</Label>
          <Input value={openDepth} onChange={setOpenDepth} type="number" placeholder="10" /></div>
        <Btn label="Add opening" onClick={submitOpening}
          disabled={!openX1 || !openY1 || !openX2 || !openY2} accent />

        {/* Opening list */}
        {venue.openings.length > 0 && (
          <div className="mt-3">
            {venue.openings.map(op => {
              const [p1, p2] = op.segment
              return (
                <div key={op.id} className="flex items-center justify-between mb-1"
                  style={{ background: '#0d1820', borderRadius: 4, padding: '4px 8px' }}>
                  <span style={{ color: '#c8d8e8', fontSize: 11 }}>
                    {op.kind} ({Math.round(p1.x / GRID)},{Math.round(p1.y / GRID)})→({Math.round(p2.x / GRID)},{Math.round(p2.y / GRID)})
                  </span>
                  <button type="button" onClick={() => removeOpening(op.id)}
                    style={{ color: '#f87171', fontSize: 11, background: 'none',
                      border: 'none', cursor: 'pointer', paddingLeft: 8 }}>✕</button>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Background image */}
      <Section title="Background image">
        <label className="block cursor-pointer">
          <span className="block rounded px-2.5 py-1 text-xs text-center"
            style={{ background: '#1b2a38', color: '#7a9ab0', border: '1px solid #243344' }}>
            {hasBgImage ? 'Replace image…' : 'Upload floor plan image…'}
          </span>
          <input type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onUploadImage(f) }} />
        </label>
        {hasBgImage && (
          <div className="mt-2">
            <Btn label="Calibrate scale (2-point)" onClick={onCalibrateStart} />
          </div>
        )}
        {!venue.scale && hasBgImage && (
          <p style={{ color: '#4a6070', fontSize: 10, marginTop: 4 }}>
            Calibrate to align image with venue coordinates.
          </p>
        )}
        {venue.scale && (
          <p style={{ color: '#4a6070', fontSize: 10, marginTop: 4 }}>
            Scale: {venue.scale.pixelsPerInch.toFixed(3)} px/in
          </p>
        )}
      </Section>
    </aside>
  )
}
