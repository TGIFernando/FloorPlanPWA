import { usePlanStore } from '../store/planStore'
import FloorCanvas from './canvas/FloorCanvas'
import RulesPanel from './panels/RulesPanel'
import DiagnosticsPanel from './panels/DiagnosticsPanel'
import StatusBar from './StatusBar'

export default function LayoutView() {
  const plan       = usePlanStore(s => s.plan)
  const triggerFit = usePlanStore(s => s.triggerFit)

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

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={triggerFit}
            className="rounded px-3 py-1 text-xs"
            style={{ background: '#1b2a38', color: '#7a9ab0', border: '1px solid #243344',
              cursor: 'pointer' }}
          >
            Fit
          </button>
        </div>
      </header>

      {/* Body: left panel + canvas + right panel */}
      <div className="flex flex-1 overflow-hidden">
        <RulesPanel />
        <FloorCanvas />
        <DiagnosticsPanel />
      </div>

      <StatusBar />
    </div>
  )
}
