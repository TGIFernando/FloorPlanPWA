import { usePlanStore } from '../store/planStore'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span style={{ color: '#4a6070', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ color: '#c8d8e8', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
        {value}
      </span>
    </div>
  )
}

function Divider() {
  return <span style={{ color: '#243344', userSelect: 'none' }}>|</span>
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

export default function StatusBar() {
  const result       = usePlanStore(s => s.layoutResult)
  const plan         = usePlanStore(s => s.plan)
  const isGenerating = usePlanStore(s => s.isGenerating)

  const totalRequested = plan.boothTypes.reduce((s, t) => s + t.quantity, 0)
  const totalPlaced    = result?.metrics.totalPlaced ?? 0
  const efficiency     = result ? Math.round(result.metrics.sellEfficiency * 100) : 0
  const revenue        = result?.metrics.estimatedRevenue ?? 0
  const unplaced       = result
    ? Object.values(result.unplacedCount).reduce((s, n) => s + n, 0)
    : 0

  return (
    <div
      className="flex items-center gap-4 px-4"
      style={{
        height: 32, flexShrink: 0,
        background: '#131e28', borderTop: '1px solid #1e2f3f',
      }}
    >
      <Stat label="Placed" value={`${totalPlaced} / ${totalRequested}`} />
      {unplaced > 0 && (
        <Stat label="Unplaced" value={String(unplaced)} />
      )}
      <Divider />
      <Stat label="Sell eff." value={`${efficiency}%`} />
      <Divider />
      <Stat label="Revenue" value={fmtMoney(revenue)} />

      {isGenerating && (
        <span style={{ color: '#4a6070', fontSize: 10, marginLeft: 'auto',
          fontFamily: 'ui-monospace, monospace' }}>
          generating…
        </span>
      )}
    </div>
  )
}
