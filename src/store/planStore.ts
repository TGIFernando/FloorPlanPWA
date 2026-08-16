import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { current } from 'immer'
import type { ShowPlan, LayoutResult, LayoutRules, Suggestion, Point, Inches } from '../engine/types'

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
export interface ContextMenuState {
  boothId: string
  screenX: number
  screenY: number
}

interface PlanStore {
  plan: ShowPlan
  layoutResult: LayoutResult | null
  isGenerating: boolean
  selectedIds: string[]
  viewFitTrigger: number
  showOverlays: { numbers: boolean; dimensions: boolean; aisles: boolean }

  // History
  past: ShowPlan[]
  future: ShowPlan[]

  // Editing UI state
  movedBoothIds: string[]
  contextMenu: ContextMenuState | null

  // Derived helpers
  canUndo: boolean
  canRedo: boolean
  pinnedCount: number

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

  // History actions
  undo: () => void
  redo: () => void
  _pushHistory: () => void

  // Booth editing actions (each pushes to history)
  moveBooth: (boothId: string, origin: Point) => void
  resizeBooth: (boothId: string, width: Inches, depth?: Inches) => void
  pinBooth: (boothId: string) => void
  unpinBooth: (boothId: string) => void
  deleteBooth: (boothId: string) => void
  setBoothStatus: (boothId: string, status: 'available' | 'held' | 'sold') => void
  setBoothType: (boothId: string, typeId: string) => void
  resetAllOverrides: () => void

  // Context menu
  showContextMenu: (state: ContextMenuState) => void
  hideContextMenu: () => void
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
    past: [],
    future: [],
    movedBoothIds: [],
    contextMenu: null,
    canUndo: false,
    canRedo: false,
    pinnedCount: 0,

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
      set(state => {
        // Track moved booths for highlight
        const prev = state.layoutResult
        if (prev && state.plan.overrides.length > 0) {
          const prevByNum = new Map(prev.booths.map(b => [b.number, b.origin]))
          state.movedBoothIds = r.booths
            .filter(b => {
              const po = prevByNum.get(b.number)
              return po && (po.x !== b.origin.x || po.y !== b.origin.y)
            })
            .map(b => b.id)
        } else {
          state.movedBoothIds = []
        }
        state.layoutResult = r
        state.isGenerating = false
        state.pinnedCount = r.booths.filter(b => b.pinned).length
      })
      if (get().movedBoothIds.length > 0) {
        setTimeout(() => usePlanStore.setState(s => ({ ...s, movedBoothIds: [] })), 600)
      }
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
      get()._pushHistory()
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

    // ---------------------------------------------------------------------------
    // History
    // ---------------------------------------------------------------------------

    _pushHistory: () => {
      set(state => {
        state.past.push(JSON.parse(JSON.stringify(current(state.plan))) as ShowPlan)
        state.future = []
        if (state.past.length > 100) state.past.shift()
        state.canUndo = true
        state.canRedo = false
      })
    },

    undo: () => {
      if (!get().canUndo) return
      set(state => {
        const prev = state.past.pop()!
        state.future.unshift(JSON.parse(JSON.stringify(current(state.plan))) as ShowPlan)
        state.plan = prev
        state.canUndo = state.past.length > 0
        state.canRedo = true
      })
      get().triggerGenerate()
    },

    redo: () => {
      if (!get().canRedo) return
      set(state => {
        const next = state.future.shift()!
        state.past.push(JSON.parse(JSON.stringify(current(state.plan))) as ShowPlan)
        state.plan = next
        state.canUndo = true
        state.canRedo = state.future.length > 0
      })
      get().triggerGenerate()
    },

    // ---------------------------------------------------------------------------
    // Booth editing
    // ---------------------------------------------------------------------------

    moveBooth: (boothId, origin) => {
      get()._pushHistory()
      set(state => {
        // Optimistic update
        if (state.layoutResult) {
          const b = state.layoutResult.booths.find(b => b.id === boothId)
          if (b) { b.origin = origin; b.pinned = true }
        }
        // Upsert override
        const idx = state.plan.overrides.findIndex(o => o.boothId === boothId)
        const ov = { boothId, origin, pinned: true as const }
        if (idx >= 0) Object.assign(state.plan.overrides[idx], ov)
        else state.plan.overrides.push(ov)
      })
      get().triggerGenerate()
    },

    resizeBooth: (boothId, width, depth) => {
      get()._pushHistory()
      set(state => {
        // Optimistic update
        if (state.layoutResult) {
          const b = state.layoutResult.booths.find(b => b.id === boothId)
          if (b) { b.width = width; b.pinned = true; if (depth !== undefined) b.depth = depth }
        }
        const idx = state.plan.overrides.findIndex(o => o.boothId === boothId)
        const ov = { boothId, width, depth, pinned: true as const }
        if (idx >= 0) Object.assign(state.plan.overrides[idx], ov)
        else state.plan.overrides.push(ov)
      })
      get().triggerGenerate()
    },

    pinBooth: (boothId) => {
      get()._pushHistory()
      set(state => {
        if (state.layoutResult) {
          const b = state.layoutResult.booths.find(b => b.id === boothId)
          if (b) b.pinned = true
        }
        const idx = state.plan.overrides.findIndex(o => o.boothId === boothId)
        if (idx >= 0) state.plan.overrides[idx].pinned = true
        else state.plan.overrides.push({ boothId, pinned: true })
      })
      get().triggerGenerate()
    },

    unpinBooth: (boothId) => {
      get()._pushHistory()
      set(state => {
        if (state.layoutResult) {
          const b = state.layoutResult.booths.find(b => b.id === boothId)
          if (b) b.pinned = false
        }
        // Remove the override entirely (unpinned = no override)
        state.plan.overrides = state.plan.overrides.filter(o => o.boothId !== boothId)
      })
      get().triggerGenerate()
    },

    deleteBooth: (boothId) => {
      get()._pushHistory()
      set(state => {
        // Optimistic update
        if (state.layoutResult) {
          state.layoutResult.booths = state.layoutResult.booths.filter(b => b.id !== boothId)
        }
        const idx = state.plan.overrides.findIndex(o => o.boothId === boothId)
        const ov = { boothId, deleted: true, pinned: true as const }
        if (idx >= 0) state.plan.overrides[idx] = ov
        else state.plan.overrides.push(ov)
      })
      get().triggerGenerate()
    },

    setBoothStatus: (boothId, status) => {
      get()._pushHistory()
      set(state => {
        if (state.layoutResult) {
          const b = state.layoutResult.booths.find(b => b.id === boothId)
          if (b) { b.status = status; b.pinned = true }
        }
        const idx = state.plan.overrides.findIndex(o => o.boothId === boothId)
        const ov = { boothId, status, pinned: true as const }
        if (idx >= 0) Object.assign(state.plan.overrides[idx], ov)
        else state.plan.overrides.push(ov)
      })
      get().triggerGenerate()
    },

    setBoothType: (boothId, typeId) => {
      get()._pushHistory()
      set(state => {
        if (state.layoutResult) {
          const b = state.layoutResult.booths.find(b => b.id === boothId)
          if (b) { b.typeId = typeId; b.pinned = true }
        }
        const idx = state.plan.overrides.findIndex(o => o.boothId === boothId)
        const ov = { boothId, typeId, pinned: true as const }
        if (idx >= 0) Object.assign(state.plan.overrides[idx], ov)
        else state.plan.overrides.push(ov)
      })
      get().triggerGenerate()
    },

    resetAllOverrides: () => {
      get()._pushHistory()
      set(state => {
        state.plan.overrides = []
        state.pinnedCount = 0
      })
      get().triggerGenerate()
    },

    // ---------------------------------------------------------------------------
    // Context menu
    // ---------------------------------------------------------------------------

    showContextMenu: (menuState) => {
      set(state => { state.contextMenu = menuState })
    },

    hideContextMenu: () => {
      set(state => { state.contextMenu = null })
    },
  })),
)

// Kick off the initial layout generation immediately on import.
usePlanStore.getState().triggerGenerate()
