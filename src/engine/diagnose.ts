import { generateLayout } from './layout'
import type { ShowPlan, LayoutResult, Suggestion, Inches } from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * generateLayout + suggestions in one call. Use this instead of
 * generateLayout directly when you need the full diagnostics output.
 */
export function generateFullLayout(plan: ShowPlan): LayoutResult {
  const result = generateLayout(plan)
  return { ...result, suggestions: generateSuggestions(plan, result) }
}

/**
 * Generates ranked, actionable suggestions given a plan and its current
 * layout result. Every suggestion's boothsGained is computed by actually
 * running generateLayout on the modified plan, so apply() + rerun always
 * produces exactly the promised gain.
 */
export function generateSuggestions(plan: ShowPlan, current: LayoutResult): Suggestion[] {
  const basePlaced = current.metrics.totalPlaced
  const totalRequested = plan.boothTypes.reduce((s, t) => s + t.quantity, 0)
  const totalUnplaced = totalRequested - basePlaced

  const candidates: Suggestion[] = []

  /** Run a probe layout and return the booth gain vs the base. */
  function probe(newPlan: ShowPlan): number {
    return generateLayout(newPlan).metrics.totalPlaced - basePlaced
  }

  // -------------------------------------------------------------------------
  // 1. Reduce main aisle width
  //    Try the code minimum, 75%, 50%, and 40% of current width.
  //    Deduplicate by gain — keep the least disruptive (widest) aisle for each
  //    unique gain level; that maximises the suggestion's practical value.
  // -------------------------------------------------------------------------
  {
    const minCode = plan.rules.minAisleWidth ?? 96 // 8 ft NFPA typical
    const cur = plan.rules.mainAisleWidth
    const floor = Math.max(36, minCode - 48) // never try below 3 ft

    const widths = uniqueSortedDesc([
      minCode,
      roundTo6(cur * 0.75),
      roundTo6(cur * 0.5),
      floor,
    ].filter(w => w > 0 && w < cur))

    // gained → best (widest) width for that gain
    const byGain = new Map<number, { w: Inches; plan: ShowPlan }>()
    for (const w of widths) {
      const newPlan: ShowPlan = { ...plan, rules: { ...plan.rules, mainAisleWidth: w, crossAisleWidth: w } }
      const gained = probe(newPlan)
      if (gained <= 0) continue
      const existing = byGain.get(gained)
      if (!existing || w > existing.w) byGain.set(gained, { w, plan: newPlan })
    }

    for (const [gained, { w, plan: p }] of byGain) {
      const belowCode = w < minCode
      candidates.push({
        id: `reduce-aisle-${w}`,
        label: `Narrow main aisles from ${ft(cur)} to ${ft(w)}`,
        detail: `Adds ${gained} booth${pl(gained)} by fitting an extra row pair in the recovered depth.`,
        boothsGained: gained,
        tradeoff: belowCode
          ? `${ft(w)} is below the ${ft(minCode)} code minimum — verify with the Authority Having Jurisdiction.`
          : `Verify this meets your venue's minimum aisle requirement.`,
        confidence: 'exact',
        apply: () => p,
      })
    }
  }

  // -------------------------------------------------------------------------
  // 2. Reduce perimeter setback
  //    Try 50%, 25%, and 0 of the current setback.
  //    Deduplicate by gain — keep least disruptive (largest) setback per level.
  // -------------------------------------------------------------------------
  {
    const cur = plan.venue.perimeterSetback
    if (cur > 0) {
      const setbacks = uniqueSortedDesc([
        Math.round(cur * 0.5),
        Math.round(cur * 0.25),
        0,
      ].filter(s => s < cur))

      const byGain = new Map<number, { sb: Inches; plan: ShowPlan }>()
      for (const sb of setbacks) {
        const newPlan: ShowPlan = { ...plan, venue: { ...plan.venue, perimeterSetback: sb } }
        const gained = probe(newPlan)
        if (gained <= 0) continue
        const existing = byGain.get(gained)
        if (!existing || sb > existing.sb) byGain.set(gained, { sb, plan: newPlan })
      }

      for (const [gained, { sb, plan: p }] of byGain) {
        candidates.push({
          id: `reduce-setback-${sb}`,
          label: `Reduce perimeter setback from ${ft(cur)} to ${ft(sb)}`,
          detail: `Recovers wall-side margin and adds ${gained} booth${pl(gained)}.`,
          boothsGained: gained,
          tradeoff: sb === 0
            ? 'Zero setback places booths directly against the wall — verify egress clearance with your venue.'
            : `Confirm the reduced setback meets your venue's minimum clearance requirement.`,
          confidence: 'exact',
          apply: () => p,
        })
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Flip orientation
  //    Non-square halls often gain 5–15% by flipping; always worth checking.
  // -------------------------------------------------------------------------
  {
    const flip = plan.rules.orientation === 'vertical' ? 'horizontal' : 'vertical'
    const newPlan: ShowPlan = { ...plan, rules: { ...plan.rules, orientation: flip } }
    const gained = probe(newPlan)
    if (gained > 0) {
      candidates.push({
        id: 'flip-orientation',
        label: `Switch to ${flip} orientation`,
        detail: `Running rows ${flip}ly adds ${gained} booth${pl(gained)} in this hall shape.`,
        boothsGained: gained,
        tradeoff: 'Aisle directions and booth numbering will shift. Preview before sharing with exhibitors.',
        confidence: 'exact',
        apply: () => newPlan,
      })
    }
  }

  // -------------------------------------------------------------------------
  // 4. Remove cross-aisle breaks
  //    Eliminating internal breaks at maxBoothsPerRun recovers cross-aisle width.
  // -------------------------------------------------------------------------
  if (plan.rules.maxBoothsPerRun < 9999) {
    const newPlan: ShowPlan = { ...plan, rules: { ...plan.rules, maxBoothsPerRun: 9999 } }
    const gained = probe(newPlan)
    if (gained > 0) {
      candidates.push({
        id: 'remove-cross-aisles',
        label: 'Remove internal cross-aisle breaks',
        detail: `Eliminating cross-aisle space adds ${gained} booth${pl(gained)}.`,
        boothsGained: gained,
        tradeoff: 'Long unbroken runs can violate dead-end aisle egress limits — verify travel distance.',
        confidence: 'exact',
        apply: () => newPlan,
      })
    }
  }

  // -------------------------------------------------------------------------
  // 5. Remove each GapRule
  // -------------------------------------------------------------------------
  for (const gap of plan.rules.gaps) {
    const newPlan: ShowPlan = {
      ...plan,
      rules: { ...plan.rules, gaps: plan.rules.gaps.filter(g => g.id !== gap.id) },
    }
    const gained = probe(newPlan)
    if (gained > 0) {
      const gapName = gap.label ? `"${gap.label}"` : `gap after row ${gap.afterIndex}`
      candidates.push({
        id: `remove-gap-${gap.id}`,
        label: `Remove ${gapName} (${ft(gap.size)})`,
        detail: `Recovering this gap adds ${gained} booth${pl(gained)}.`,
        boothsGained: gained,
        tradeoff: `Removes the reserved zone entirely — add a new zone type if the space is needed for a lounge or food court.`,
        confidence: 'exact',
        apply: () => newPlan,
      })
    }
  }

  // -------------------------------------------------------------------------
  // 6. Substitute booth types
  //    If the largest unplaced type can be swapped for the smallest placed type,
  //    compute the net gain.
  // -------------------------------------------------------------------------
  {
    const largestUnplaced = plan.boothTypes
      .filter(t => (current.unplacedCount[t.id] ?? 0) > 0 && t.style !== 'island')
      .sort((a, b) => b.width * b.depth - a.width * a.depth)[0]

    const smallestPlaced = plan.boothTypes
      .filter(t => (current.placedCount[t.id] ?? 0) > 0 && t.style !== 'island')
      .sort((a, b) => a.width * a.depth - b.width * b.depth)[0]

    if (
      largestUnplaced &&
      smallestPlaced &&
      largestUnplaced.id !== smallestPlaced.id &&
      largestUnplaced.width * largestUnplaced.depth > smallestPlaced.width * smallestPlaced.depth
    ) {
      const unplacedCount = current.unplacedCount[largestUnplaced.id] ?? 0
      const newPlan: ShowPlan = {
        ...plan,
        boothTypes: plan.boothTypes.map(t =>
          t.id === largestUnplaced.id
            ? { ...t, quantity: t.quantity - unplacedCount }
            : t.id === smallestPlaced.id
              ? {
                  ...t,
                  quantity:
                    t.quantity +
                    Math.floor((largestUnplaced.width * largestUnplaced.depth * unplacedCount) /
                      (smallestPlaced.width * smallestPlaced.depth)),
                }
              : t,
        ),
      }
      const gained = probe(newPlan)
      if (gained > 0) {
        candidates.push({
          id: `substitute-${largestUnplaced.id}-to-${smallestPlaced.id}`,
          label: `Convert ${unplacedCount} unplaced ${largestUnplaced.name} to ${smallestPlaced.name}`,
          detail: `Substituting the unplaced ${largestUnplaced.name} booths for ${smallestPlaced.name} adds ${gained} booth${pl(gained)} in the same footprint.`,
          boothsGained: gained,
          tradeoff: 'Smaller booth types have lower revenue per unit — check pricing impact.',
          confidence: 'exact',
          apply: () => newPlan,
        })
      }
    }
  }

  // -------------------------------------------------------------------------
  // 7. Trim the ask (always include when something is unplaced)
  //    Sets each type's quantity to exactly what the current run placed.
  //    boothsGained will be 0 (same placed count) but the plan becomes feasible.
  // -------------------------------------------------------------------------
  if (totalUnplaced > 0) {
    const trimmedPlan: ShowPlan = {
      ...plan,
      boothTypes: plan.boothTypes.map(t => ({
        ...t,
        quantity: current.placedCount[t.id] ?? 0,
      })),
    }
    const gained = probe(trimmedPlan)
    candidates.push({
      id: 'trim-the-ask',
      label: `Reduce to ${basePlaced} booths (remove ${totalUnplaced} that don't fit)`,
      detail: `${totalUnplaced} booth${pl(totalUnplaced)} exceed what the floor can hold. This produces a feasible plan with ${basePlaced} booths and 0 unplaced.`,
      boothsGained: gained,
      tradeoff: 'Reduces sellable inventory. Evaluate the revenue impact before accepting.',
      confidence: 'exact',
      apply: () => trimmedPlan,
    })
  }

  // Sort by boothsGained descending, then label alphabetically for stable ordering
  return candidates.sort((a, b) =>
    b.boothsGained !== a.boothsGained
      ? b.boothsGained - a.boothsGained
      : a.label.localeCompare(b.label),
  )
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function roundTo6(n: number): Inches {
  return Math.round(n / 6) * 6
}

function uniqueSortedDesc(ns: number[]): number[] {
  return [...new Set(ns)].sort((a, b) => b - a)
}

function ft(inches: Inches): string {
  const f = Math.floor(inches / 12)
  const r = inches % 12
  return r === 0 ? `${f} ft` : `${f} ft ${r} in`
}

function pl(n: number): string {
  return n === 1 ? '' : 's'
}
