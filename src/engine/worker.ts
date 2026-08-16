// Web Worker — runs generateFullLayout off the main thread.
import { generateFullLayout } from './diagnose'
import type { ShowPlan, LayoutResult } from './types'

// Cast self to the worker global scope so TypeScript is satisfied.
const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (e: MessageEvent<ShowPlan>) => {
  try {
    const result: LayoutResult = generateFullLayout(e.data)
    ctx.postMessage(result)
  } catch (err) {
    // Return an empty-ish result with the error as a problem so the UI never hangs.
    ctx.postMessage({
      booths: [], aisles: [], placedCount: {}, unplacedCount: {},
      metrics: { totalPlaced: 0, perTypePlaced: {}, perTypeRequested: {},
        grossArea: 0, netSellableArea: 0, aisleArea: 0, deadSpace: 0,
        sellEfficiency: 0, estimatedRevenue: 0 },
      problems: [{ code: 'INSUFFICIENT_AREA', severity: 'error',
        message: `Worker error: ${String(err)}`, affectedBoothIds: [] }],
      suggestions: [],
    })
  }
}
