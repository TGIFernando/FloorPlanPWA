import type { ShowPlan } from '../engine/types'

export function savePlan(plan: ShowPlan): void {
  const json = JSON.stringify(plan, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${plan.name.replace(/[^a-z0-9]/gi, '_')}.floorplan.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function parsePlan(raw: unknown): ShowPlan | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Record<string, unknown>
  if (p.schemaVersion !== 1) return null
  if (typeof p.id !== 'string') return null
  if (typeof p.name !== 'string') return null
  const venue = p.venue as Record<string, unknown> | undefined
  if (!venue || !Array.isArray(venue.outline)) return null
  if (!Array.isArray(p.boothTypes)) return null
  if (typeof p.rules !== 'object' || p.rules === null) return null
  return raw as ShowPlan
}
