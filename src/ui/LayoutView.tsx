import { useRef } from 'react'
import { usePlanStore } from '../store/planStore'
import { savePlan, parsePlan } from '../store/planIO'
import FloorCanvas from './canvas/FloorCanvas'
import RulesPanel from './panels/RulesPanel'
import DiagnosticsPanel from './panels/DiagnosticsPanel'
import StatusBar from './StatusBar'

function ToolBtn({
  label,
  onClick,
  disabled,
  accent,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  accent?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded px-2.5 py-1 text-xs"
      style={{
        background: accent ? '#1e3a5f' : '#1b2a38',
        color: disabled ? '#2a3f52' : accent ? '#60a5fa' : '#7a9ab0',
        border: `1px solid ${disabled ? '#1e2f3f' : accent ? '#2a5078' : '#243344'}`,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}

export default function LayoutView() {
  const plan           = usePlanStore(s => s.plan)
  const setView        = usePlanStore(s => s.setView)
  const triggerFit     = usePlanStore(s => s.triggerFit)
  const undo           = usePlanStore(s => s.undo)
  const redo           = usePlanStore(s => s.redo)
  const canUndo        = usePlanStore(s => s.canUndo)
  const canRedo        = usePlanStore(s => s.canRedo)
  const pinnedCount    = usePlanStore(s => s.pinnedCount)
  const resetOverrides = usePlanStore(s => s.resetAllOverrides)
  const loadPlan       = usePlanStore(s => s.loadPlan)
  const fileInputRef   = useRef<HTMLInputElement>(null)

  const handleLoadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string)
        const plan = parsePlan(raw)
        if (!plan) { alert('Invalid floor plan file.'); return }
        loadPlan(plan)
      } catch {
        alert('Could not read file.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col" style={{ height: '100dvh', background: '#0d1820' }}>
      {/* Header */}
      <header
        className="flex items-center gap-3 px-4 shrink-0"
        style={{ height: 44, background: '#131e28', borderBottom: '1px solid #1e2f3f' }}
      >
        <span style={{ color: '#4a90d9', fontWeight: 700, fontSize: 13,
          fontFamily: 'ui-monospace, monospace', letterSpacing: '0.04em' }}>
          FloorPlan
        </span>
        <span style={{ color: '#243344', userSelect: 'none' }}>·</span>
        <span style={{ color: '#7a9ab0', fontSize: 12 }}>{plan.name}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {pinnedCount > 0 && (
            <span style={{ color: '#f59e0b', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
              {pinnedCount} pinned
            </span>
          )}
          {plan.overrides.length > 0 && (
            <ToolBtn label="Reset edits" onClick={resetOverrides} accent />
          )}
          <ToolBtn label="Undo" onClick={undo} disabled={!canUndo} />
          <ToolBtn label="Redo" onClick={redo} disabled={!canRedo} />
          <ToolBtn label="Fit" onClick={triggerFit} />
          <ToolBtn label="Save" onClick={() => savePlan(plan)} />
          <ToolBtn label="Load" onClick={() => fileInputRef.current?.click()} />
          <button type="button"
            onClick={() => setView('venue')}
            className="rounded px-3 py-1 text-xs"
            style={{ background: '#1e3a5f', color: '#60a5fa',
              border: '1px solid #2a5078', cursor: 'pointer' }}>
            Venue Editor →
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.floorplan.json"
          style={{ display: 'none' }}
          onChange={handleLoadFile}
        />
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <RulesPanel />
        <FloorCanvas />
        <DiagnosticsPanel />
      </div>

      <StatusBar />
    </div>
  )
}
