import { usePlanStore } from '../../store/planStore'
import type { Problem, Suggestion } from '../../engine/types'

const SEVERITY_COLOR: Record<Problem['severity'], string> = {
  error:   '#f87171',
  warning: '#fbbf24',
  info:    '#60a5fa',
}

function ProblemRow({ p }: { p: Problem }) {
  return (
    <div
      className="mb-2 rounded px-2 py-1.5"
      style={{ background: '#0d1820', borderLeft: `3px solid ${SEVERITY_COLOR[p.severity]}` }}
    >
      <p style={{ color: SEVERITY_COLOR[p.severity], fontSize: 10, letterSpacing: '0.06em',
        textTransform: 'uppercase', marginBottom: 2 }}>
        {p.severity} · {p.code}
      </p>
      <p style={{ color: '#c8d8e8', fontSize: 12, lineHeight: 1.4 }}>{p.message}</p>
    </div>
  )
}

function SuggestionRow({ s, onApply }: { s: Suggestion; onApply: () => void }) {
  return (
    <div
      className="mb-2 rounded px-2 py-1.5"
      style={{ background: '#0d1820', border: '1px solid #243344' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div style={{ flex: 1 }}>
          <p style={{ color: '#c8d8e8', fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
            {s.label}
            {s.boothsGained > 0 && (
              <span style={{ color: '#34d399', fontSize: 11, marginLeft: 6 }}>
                +{s.boothsGained} booths
              </span>
            )}
          </p>
          <p style={{ color: '#7a9ab0', fontSize: 11, lineHeight: 1.4 }}>{s.detail}</p>
          {s.tradeoff && (
            <p style={{ color: '#4a6070', fontSize: 10, marginTop: 2, fontStyle: 'italic' }}>
              {s.tradeoff}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onApply}
          className="shrink-0 rounded px-2 py-0.5 text-xs"
          style={{ background: '#1e3a5f', color: '#60a5fa', border: '1px solid #2a5078',
            cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Apply
        </button>
      </div>
    </div>
  )
}

export default function DiagnosticsPanel() {
  const result       = usePlanStore(s => s.layoutResult)
  const isGenerating = usePlanStore(s => s.isGenerating)
  const applySugg    = usePlanStore(s => s.applySuggestion)

  if (!result && !isGenerating) return null

  const problems    = result?.problems    ?? []
  const suggestions = result?.suggestions ?? []

  return (
    <aside
      className="flex flex-col overflow-y-auto"
      style={{
        width: 272, flexShrink: 0,
        background: '#1b2a38', borderLeft: '1px solid #243344',
        padding: '16px 14px',
      }}
    >
      {/* Problems */}
      <div className="mb-6">
        <p style={{ color: '#4a90d9', fontSize: 11, letterSpacing: '0.1em',
          textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>
          Problems
        </p>
        {problems.length === 0 ? (
          <p style={{ color: '#4a6070', fontSize: 12 }}>No problems detected.</p>
        ) : (
          problems.map((p, i) => <ProblemRow key={i} p={p} />)
        )}
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div>
          <p style={{ color: '#4a90d9', fontSize: 11, letterSpacing: '0.1em',
            textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>
            Suggestions
          </p>
          {suggestions.map(s => (
            <SuggestionRow key={s.id} s={s} onApply={() => applySugg(s)} />
          ))}
        </div>
      )}
    </aside>
  )
}
