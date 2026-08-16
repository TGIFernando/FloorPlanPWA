import { describe, it, expect, beforeEach } from 'vitest'
import { usePlanStore, DEFAULT_PLAN } from './planStore'
import type { ShowPlan } from '../engine/types'

// Reset store to a clean slate before each test
function resetStore() {
  usePlanStore.setState({
    plan: JSON.parse(JSON.stringify(DEFAULT_PLAN)) as ShowPlan,
    layoutResult: null,
    isGenerating: false,
    selectedIds: [],
    past: [],
    future: [],
    movedBoothIds: [],
    contextMenu: null,
    canUndo: false,
    canRedo: false,
    pinnedCount: 0,
  })
}

describe('History — undo/redo', () => {
  beforeEach(resetStore)

  it('canUndo is false initially', () => {
    expect(usePlanStore.getState().canUndo).toBe(false)
  })

  it('canRedo is false initially', () => {
    expect(usePlanStore.getState().canRedo).toBe(false)
  })

  it('_pushHistory makes canUndo true', () => {
    usePlanStore.getState()._pushHistory()
    expect(usePlanStore.getState().canUndo).toBe(true)
  })

  it('undo restores the previous plan', () => {
    const original = usePlanStore.getState().plan
    usePlanStore.getState()._pushHistory()
    usePlanStore.setState(s => ({
      ...s,
      plan: { ...s.plan, name: 'Modified' },
    }))
    usePlanStore.getState().undo()
    expect(usePlanStore.getState().plan.name).toBe(original.name)
  })

  it('redo re-applies the undone change', () => {
    usePlanStore.getState()._pushHistory()
    usePlanStore.setState(s => ({
      ...s,
      plan: { ...s.plan, name: 'Modified' },
    }))
    usePlanStore.getState().undo()
    usePlanStore.getState().redo()
    expect(usePlanStore.getState().plan.name).toBe('Modified')
  })

  it('new action after undo clears the redo stack', () => {
    usePlanStore.getState()._pushHistory()
    usePlanStore.setState(s => ({ ...s, plan: { ...s.plan, name: 'A' } }))
    usePlanStore.getState().undo()
    usePlanStore.getState()._pushHistory()
    usePlanStore.setState(s => ({ ...s, plan: { ...s.plan, name: 'B' } }))
    expect(usePlanStore.getState().canRedo).toBe(false)
  })
})

describe('History — 50 mixed operations', () => {
  it('undo across 50 operations restores the original plan', () => {
    resetStore()
    const original: ShowPlan = JSON.parse(JSON.stringify(DEFAULT_PLAN))
    const store = usePlanStore.getState()

    // Push 50 diverse operations
    for (let i = 0; i < 50; i++) {
      store._pushHistory()
      // Alternate between rule changes and override mutations
      if (i % 3 === 0) {
        usePlanStore.setState(s => ({
          ...s,
          plan: {
            ...s.plan,
            rules: { ...s.plan.rules, mainAisleWidth: 120 + (i % 5) * 12 },
          },
        }))
      } else if (i % 3 === 1) {
        usePlanStore.setState(s => ({
          ...s,
          plan: {
            ...s.plan,
            overrides: [
              ...s.plan.overrides,
              { boothId: `booth-${i}`, pinned: true, width: 120 + i * 12 },
            ],
          },
        }))
      } else {
        usePlanStore.setState(s => ({
          ...s,
          plan: { ...s.plan, name: `Plan step ${i}` },
        }))
      }
    }

    expect(usePlanStore.getState().past.length).toBe(50)
    expect(usePlanStore.getState().canUndo).toBe(true)

    // Undo all 50
    for (let i = 0; i < 50; i++) {
      usePlanStore.getState().undo()
    }

    expect(usePlanStore.getState().canUndo).toBe(false)
    expect(usePlanStore.getState().plan.name).toBe(original.name)
    expect(usePlanStore.getState().plan.rules.mainAisleWidth).toBe(original.rules.mainAisleWidth)
    expect(usePlanStore.getState().plan.overrides).toHaveLength(0)
  })

  it('redo after undoing 50 operations restores the final state', () => {
    resetStore()
    const store = usePlanStore.getState()

    for (let i = 0; i < 50; i++) {
      store._pushHistory()
      usePlanStore.setState(s => ({
        ...s, plan: { ...s.plan, name: `step-${i}` },
      }))
    }
    const finalName = usePlanStore.getState().plan.name

    for (let i = 0; i < 50; i++) usePlanStore.getState().undo()
    for (let i = 0; i < 50; i++) usePlanStore.getState().redo()

    expect(usePlanStore.getState().plan.name).toBe(finalName)
    expect(usePlanStore.getState().canRedo).toBe(false)
  })
})

describe('resetAllOverrides', () => {
  it('clears all overrides and pushes to history', () => {
    resetStore()
    // Add some overrides
    usePlanStore.setState(s => ({
      ...s,
      plan: {
        ...s.plan,
        overrides: [
          { boothId: 'booth-1', pinned: true, deleted: true },
          { boothId: 'booth-2', pinned: true, width: 240 },
        ],
      },
    }))
    usePlanStore.getState().resetAllOverrides()
    expect(usePlanStore.getState().plan.overrides).toHaveLength(0)
    expect(usePlanStore.getState().canUndo).toBe(true)
  })
})

describe('Override actions', () => {
  beforeEach(resetStore)

  it('moveBooth creates an override with origin and pushes history', () => {
    usePlanStore.getState().moveBooth('booth-5', { x: 300, y: 240 })
    const state = usePlanStore.getState()
    const ov = state.plan.overrides.find(o => o.boothId === 'booth-5')
    expect(ov).toBeDefined()
    expect(ov?.origin).toEqual({ x: 300, y: 240 })
    expect(ov?.pinned).toBe(true)
    expect(state.canUndo).toBe(true)
  })

  it('resizeBooth creates an override with width', () => {
    usePlanStore.getState().resizeBooth('booth-10', 240)
    const ov = usePlanStore.getState().plan.overrides.find(o => o.boothId === 'booth-10')
    expect(ov?.width).toBe(240)
  })

  it('deleteBooth creates a deleted override', () => {
    usePlanStore.getState().deleteBooth('booth-3')
    const ov = usePlanStore.getState().plan.overrides.find(o => o.boothId === 'booth-3')
    expect(ov?.deleted).toBe(true)
  })

  it('setBoothStatus creates a status override', () => {
    usePlanStore.getState().setBoothStatus('booth-7', 'sold')
    const ov = usePlanStore.getState().plan.overrides.find(o => o.boothId === 'booth-7')
    expect(ov?.status).toBe('sold')
  })

  it('unpinBooth removes the override', () => {
    // First pin
    usePlanStore.getState().pinBooth('booth-4')
    expect(usePlanStore.getState().plan.overrides.some(o => o.boothId === 'booth-4')).toBe(true)
    // Then unpin
    usePlanStore.getState().unpinBooth('booth-4')
    expect(usePlanStore.getState().plan.overrides.some(o => o.boothId === 'booth-4')).toBe(false)
  })

  it('moveBooth then undo removes the override', () => {
    usePlanStore.getState().moveBooth('booth-5', { x: 300, y: 240 })
    usePlanStore.getState().undo()
    expect(usePlanStore.getState().plan.overrides.some(o => o.boothId === 'booth-5')).toBe(false)
  })
})
