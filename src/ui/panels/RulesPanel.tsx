import { usePlanStore } from '../../store/planStore'

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ color: '#7a9ab0', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {children}
    </span>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1 mb-4">{children}</div>
}

function SliderRow({
  label, value, min, max, step, format, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number
  format?: (v: number) => string; onChange: (v: number) => void
}) {
  const fmt = format ?? ((v: number) => String(v))
  return (
    <Row>
      <div className="flex justify-between items-baseline">
        <Label>{label}</Label>
        <span style={{ color: '#c8d8e8', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
          {fmt(value)}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
        style={{ height: 4 }}
      />
    </Row>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <button
          type="button"
          onClick={() => onChange(!value)}
          className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
          style={{ background: value ? '#3a82f6' : '#2a3f52' }}
          aria-pressed={value}
        >
          <span
            className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5"
            style={{ transform: `translateX(${value ? '18px' : '2px'})` }}
          />
        </button>
      </div>
    </Row>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p style={{ color: '#4a90d9', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
        marginBottom: 10, fontWeight: 600 }}>
        {title}
      </p>
      {children}
    </div>
  )
}

function fmtFt(inches: number): string {
  const ft = Math.floor(inches / 12)
  const rem = inches % 12
  return rem === 0 ? `${ft} ft` : `${ft}'${rem}"`
}

export default function RulesPanel() {
  const rules   = usePlanStore(s => s.plan.rules)
  const types   = usePlanStore(s => s.plan.boothTypes)
  const overlays = usePlanStore(s => s.showOverlays)
  const update  = usePlanStore(s => s.updateRules)
  const setQty  = usePlanStore(s => s.setBoothQuantity)
  const toggleOv = usePlanStore(s => s.toggleOverlay)

  return (
    <aside
      className="flex flex-col overflow-y-auto"
      style={{
        width: 272, flexShrink: 0,
        background: '#1b2a38', borderRight: '1px solid #243344',
        padding: '16px 14px',
      }}
    >
      <Section title="Aisles">
        <SliderRow
          label="Main aisle" value={rules.mainAisleWidth}
          min={60} max={240} step={6}
          format={fmtFt}
          onChange={v => update({ mainAisleWidth: v, crossAisleWidth: v })}
        />
        <SliderRow
          label="Cross aisle" value={rules.crossAisleWidth}
          min={60} max={240} step={6}
          format={fmtFt}
          onChange={v => update({ crossAisleWidth: v })}
        />
        <SliderRow
          label="Booths per run" value={rules.maxBoothsPerRun}
          min={4} max={50} step={1}
          onChange={v => update({ maxBoothsPerRun: v })}
        />
        <Toggle
          label="Back-to-back rows"
          value={rules.backToBack}
          onChange={v => update({ backToBack: v })}
        />
      </Section>

      <Section title="Orientation">
        <Row>
          <div className="flex gap-2">
            {(['horizontal', 'vertical', 'auto'] as const).map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => update({ orientation: opt })}
                className="flex-1 py-1 rounded text-xs capitalize"
                style={{
                  background: rules.orientation === opt ? '#3a82f6' : '#243344',
                  color: rules.orientation === opt ? '#fff' : '#7a9ab0',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Booth types">
        {types.map(t => (
          <Row key={t.id}>
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                style={{ background: t.color }}
              />
              <Label>{t.name}</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0} max={9999} step={1}
                value={t.quantity}
                onChange={e => setQty(t.id, Math.max(0, Number(e.target.value)))}
                className="w-full rounded px-2 py-0.5 text-xs"
                style={{
                  background: '#0d1820', border: '1px solid #243344',
                  color: '#c8d8e8', fontFamily: 'ui-monospace, monospace',
                }}
              />
              <span style={{ color: '#4a6070', fontSize: 11, whiteSpace: 'nowrap' }}>booths</span>
            </div>
          </Row>
        ))}
      </Section>

      <Section title="Overlays">
        <Toggle label="Booth numbers" value={overlays.numbers}
          onChange={() => toggleOv('numbers')} />
        <Toggle label="Aisles" value={overlays.aisles}
          onChange={() => toggleOv('aisles')} />
      </Section>
    </aside>
  )
}
