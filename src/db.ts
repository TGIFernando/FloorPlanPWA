import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ShowPlan } from './engine/types'

interface FloorPlanDB extends DBSchema {
  plans: {
    key: string
    value: ShowPlan
    indexes: { 'by-name': string }
  }
}

let _db: IDBPDatabase<FloorPlanDB> | null = null

async function getDb(): Promise<IDBPDatabase<FloorPlanDB>> {
  if (_db) return _db
  _db = await openDB<FloorPlanDB>('floorplan', 1, {
    upgrade(db) {
      const store = db.createObjectStore('plans', { keyPath: 'id' })
      store.createIndex('by-name', 'name')
    },
  })
  return _db
}

export async function savePlan(plan: ShowPlan): Promise<void> {
  const db = await getDb()
  await db.put('plans', plan)
}

export async function loadPlan(id: string): Promise<ShowPlan | undefined> {
  const db = await getDb()
  return db.get('plans', id)
}

export async function listPlans(): Promise<ShowPlan[]> {
  const db = await getDb()
  return db.getAll('plans')
}

export async function deletePlan(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('plans', id)
}
