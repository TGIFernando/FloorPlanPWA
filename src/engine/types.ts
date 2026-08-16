export type Inches = number // integer, always

export interface Point {
  x: Inches
  y: Inches
}

export interface Rect {
  x: Inches
  y: Inches
  width: Inches
  height: Inches
}

export interface Venue {
  id: string
  name: string
  /** Outer wall, closed polygon, clockwise. Supports non-rectangular halls. */
  outline: Point[]
  obstacles: Obstacle[]
  openings: Opening[]
  perimeterSetback: Inches
  ceilingZones?: CeilingZone[]
  utilities?: UtilityPoint[]
  /** For traced background images. */
  scale: { pixelsPerInch: number } | null
  /** Datum origin for all ordinate dimensions. */
  datum?: Point
  /** Optional structural column grid. */
  columnGrid?: ColumnGrid
}

export interface Obstacle {
  id: string
  kind: 'column' | 'wall' | 'stage' | 'fixed-structure' | 'reserved'
  polygon: Point[]
  label?: string
  buffer: Inches
}

export interface Opening {
  id: string
  kind: 'entrance' | 'fire-exit' | 'loading-dock' | 'service'
  segment: [Point, Point]
  clearDepth: Inches
  egressCapacity?: number
}

export interface CeilingZone {
  id: string
  polygon: Point[]
  maxHeight: Inches
}

export interface UtilityPoint {
  id: string
  x: Inches
  y: Inches
  kinds: ('power' | 'water' | 'air' | 'data')[]
}

export interface ColumnGrid {
  origin: Point
  /** Column spacing along X axis */
  spacingX: Inches
  /** Column spacing along Y axis */
  spacingY: Inches
  /** Letters for X columns (A, B, C…) */
  xLabels: string[]
  /** Numbers for Y rows (1, 2, 3…) */
  yLabels: string[]
}

export interface BoothType {
  id: string
  name: string
  width: Inches
  depth: Inches
  style: 'inline' | 'corner' | 'peninsula' | 'island'
  quantity: number
  /** Placed first when space is tight; lower = higher priority */
  priority: number
  color: string
  pricePerUnit?: number
}

export interface LayoutRules {
  mainAisleWidth: Inches
  crossAisleWidth: Inches
  backToBack: boolean
  rowGap: Inches
  orientation: 'horizontal' | 'vertical' | 'auto'
  maxBoothsPerRun: number
  gaps: GapRule[]
  targetRows?: number
  targetAisles?: number
  boothNumbering: NumberingScheme
  cornerPremiumAuto: boolean
  /** Minimum aisle width the fire code allows; used for suggestions. */
  minAisleWidth?: Inches
}

export interface GapRule {
  id: string
  axis: 'row' | 'column'
  afterIndex: number
  size: Inches
  label?: string
}

export interface NumberingScheme {
  style: 'sequential' | 'aisle-odd-even' | 'block-prefix'
  startAt: number
  prefix?: string
  direction: 'serpentine' | 'reset-per-row'
}

export interface PlacedBooth {
  id: string
  typeId: string
  number: string
  origin: Point
  width: Inches
  depth: Inches
  rotation: 0 | 90 | 180 | 270
  rowIndex: number
  runIndex: number
  faces: ('north' | 'south' | 'east' | 'west')[]
  isCorner: boolean
  status: 'available' | 'held' | 'sold'
  exhibitorId?: string
  pinned: boolean
}

export interface BoothOverride {
  boothId: string
  width?: Inches
  depth?: Inches
  origin?: Point
  rotation?: 0 | 90 | 180 | 270
  typeId?: string
  status?: 'available' | 'held' | 'sold'
  deleted?: boolean
  pinned: true
}

export interface Exhibitor {
  id: string
  name: string
  contact?: string
}

export interface ShowPlan {
  schemaVersion: 1
  id: string
  name: string
  venue: Venue
  boothTypes: BoothType[]
  rules: LayoutRules
  overrides: BoothOverride[]
  exhibitors: Exhibitor[]
  units: 'imperial' | 'metric'
}

export interface LayoutMetrics {
  totalPlaced: number
  perTypePlaced: Record<string, number>
  perTypeRequested: Record<string, number>
  grossArea: Inches // sq inches
  netSellableArea: Inches
  aisleArea: Inches
  deadSpace: Inches
  sellEfficiency: number // 0–1
  estimatedRevenue: number
}

export interface LayoutResult {
  booths: PlacedBooth[]
  aisles: Rect[]
  placedCount: Record<string, number>
  unplacedCount: Record<string, number>
  metrics: LayoutMetrics
  problems: Problem[]
  suggestions: Suggestion[]
}

export type ProblemCode =
  | 'INSUFFICIENT_AREA'
  | 'INSUFFICIENT_ROWS'
  | 'RUN_OVERFLOW'
  | 'AISLE_BELOW_MINIMUM'
  | 'OBSTACLE_CONFLICT'
  | 'EGRESS_BLOCKED'
  | 'DEAD_END_AISLE'
  | 'ORPHAN_BOOTH'
  | 'GAP_TOO_LARGE'
  | 'ISLAND_NO_CLEARANCE'

export interface Problem {
  code: ProblemCode
  severity: 'error' | 'warning' | 'info'
  message: string
  affectedBoothIds: string[]
  region?: Rect
}

export interface Suggestion {
  id: string
  label: string
  detail: string
  boothsGained: number
  tradeoff: string
  confidence: 'exact' | 'estimated'
  apply: () => ShowPlan
}

/** Internal band produced by band decomposition. */
export interface Band {
  x: Inches
  y: Inches
  width: Inches
  height: Inches
}
