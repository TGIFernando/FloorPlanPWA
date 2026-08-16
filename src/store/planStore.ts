import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ShowPlan, LayoutResult, LayoutRules, Suggestion } from '../engine/types'

// ---------------------------------------------------------------------------
// Default plan — 400×300 ft hall, 500 10×10 inline booths (perf test target)
// ---------------------------------------------------------------------------
export const DEFAULT_PLAN: ShowPlan = {
  schemaVersion: 1,
  id: 'default',
  name: '400×300 ft Exhibition Hall',
  venue: {
    id: 'v-default',
    name: 'Main Hall',
    outline: [
      { x: 0, y: 0 },
      { x: 4800, y: 0 },
      { x: 4800, y: 3600 },
      { x: 0, y: 3600 },
    ],
    obstacles: [],
    openings: [],
    perimeterSetback: 120,
    scale: null,
  },
  boothTypes: [
    { id: 'bt-10x10', name: '10×10', width: 120, depth: 120, style: 'inline',
      quantity: 500, priority: 1, color: '#3a72b0', pricePerUnit: 2500 },
    { id: 'bt-10x20', name: '10×20', width: 120, depth: 240, style: 'inline',
      quantity: 60,  priority: 0, color: '#c06020', pricePerUnit: 5000 },
  ],
  rules: {
    mainAisleWidth: 120,
    crossAisleWidth: 120,
    backToBack: true,
    rowGap: 0,
    orientation: 'horizontal',
    maxBoothsPerRun: 20,
    gaps: [],
    boothNumbering: { style: 'aisle-odd-even', startAt: 101, direction: 'serpentine' },
    cornerPremiumAuto: true,
    minAisleWidth: 96,
  },
  overrides: [],
  exhibitors: [],
  units: 'imperial',
}

// ---------------------------------------------------------------------------
// Worker singleton — lives at module scope, not in React tree
// ---------------------------------------------------------------------------
let _worker: Worker | null = null
let _debounceTimer: ReturnType<typeof setTimeout> | null = null

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(
      new URL('../engine/worker.ts', import.meta.url),
      { type: 'module' },
    )
  }
  return _worker
}

// ---------------------------------------------------------------------------
// Store types
// ---------------------------------------------------------------------------
interface PlanStore {
  plan: ShowPlan
  layoutResult: LayoutResult | null
  isGenerating: boolean
  selectedIds: string[]
  viewFitTrigger: number
  showOverlays: { numbers: boolean; dimensions: boolean; aisles: boolean }

  // Actions
  updateRules: (patch: Partial<LayoutRules>) => void
  setBoothQuantity: (typeId: string, quantity: number) => void
  setLayoutResult: (r: LayoutResult) => void
  setGenerating: (v: boolean) => void
  toggleSelect: (id: string, multi: boolean) => void
  clearSelection: () => void
  applySuggestion: (s: Suggestion) => void
  triggerFit: () => void
  toggleOverlay: (key: keyof PlanStore['showOverlays']) => void
  triggerGenerate: () => void
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export const usePlanStore = create<PlanStore>()(
  immer((set, get) => ({
    plan: DEFAULT_PLAN,
    layoutResult: null,
    isGenerating: true,
    selectedIds: [],
    viewFitTrigger: 0,
    showOverlays: { numbers: true, dimensions: false, aisles: true },

    updateRules: (patch) => {
      set(state => { Object.assign(state.plan.rules, patch) })
      get().triggerGenerate()
    },

    setBoothQuantity: (typeId, quantity) => {
      set(state => {
        const t = state.plan.boothTypes.find(b => b.id === typeId)
        if (t) t.quantity = quantity
      })
      get().triggerGenerate()
    },

    setLayoutResult: (r) => {
      set(state => { state.layoutResult = r; state.isGenerating = false })
    },

    setGenerating: (v) => {
      set(state => { state.isGenerating = v })
    },

    toggleSelect: (id, multi) => {
      set(state => {
        if (multi) {
          const idx = state.selectedIds.indexOf(id)
          if (idx >= 0) state.selectedIds.splice(idx, 1)
          else state.selectedIds.push(id)
        } else {
          state.selectedIds = state.selectedIds[0] === id && state.selectedIds.length === 1
            ? []
            : [id]
        }
      })
    },

    clearSelection: () => {
      set(state => { state.selectedIds = [] })
    },

    applySuggestion: (s) => {
      const newPlan = s.apply()
      set(state => { state.plan = newPlan as typeof state.plan })
      get().triggerGenerate()
    },

    triggerFit: () => {
      set(state => { state.viewFitTrigger++ })
    },

    toggleOverlay: (key) => {
      set(state => { state.showOverlays[key] = !state.showOverlays[key] })
    },

    triggerGenerate: () => {
      const plan = get().plan
      set(state => { state.isGenerating = true })

      if (_debounceTimer !== null) clearTimeout(_debounceTimer)
      _debounceTimer = setTimeout(() => {
        _debounceTimer = null
        const w = getWorker()
        w.onmessage = (e: MessageEvent<LayoutResult>) => {
          get().setLayoutResult(e.data)
        }
        w.postMessage(plan)
      }, 80)
    },
  })),
)

// Kick off the initial layout generation immediately on import.
usePlanStore.getState().triggerGenerate()
