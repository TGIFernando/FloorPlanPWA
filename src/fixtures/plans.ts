import type { ShowPlan } from '../engine/types'

const defaultRules: ShowPlan['rules'] = {
  mainAisleWidth: 120,      // 10 ft
  crossAisleWidth: 120,
  backToBack: true,
  rowGap: 0,
  orientation: 'horizontal',
  maxBoothsPerRun: 20,
  gaps: [],
  boothNumbering: {
    style: 'aisle-odd-even',
    startAt: 101,
    direction: 'serpentine',
  },
  cornerPremiumAuto: true,
  minAisleWidth: 96,        // 8 ft code minimum
}

// ---------------------------------------------------------------------------
// Fixture 1: Plain 600 × 600 ft rectangular hall, 10×10 inline booths
// ---------------------------------------------------------------------------
export const rectangularHall: ShowPlan = {
  schemaVersion: 1,
  id: 'fixture-rect',
  name: '600×600 Rectangular Hall',
  venue: {
    id: 'v1',
    name: 'Main Hall',
    outline: [
      { x: 0, y: 0 },
      { x: 7200, y: 0 },
      { x: 7200, y: 7200 },
      { x: 0, y: 7200 },
    ],
    obstacles: [],
    openings: [],
    perimeterSetback: 120, // 10 ft
    scale: null,
  },
  boothTypes: [
    {
      id: 'bt-10x10',
      name: '10x10 Inline',
      width: 120,
      depth: 120,
      style: 'inline',
      quantity: 200,
      priority: 1,
      color: '#4a90d9',
    },
  ],
  rules: { ...defaultRules },
  overrides: [],
  exhibitors: [],
  units: 'imperial',
}

// ---------------------------------------------------------------------------
// Fixture 2: L-shaped hall (600×600 with a 300×300 corner cut out)
// ---------------------------------------------------------------------------
export const lShapedHall: ShowPlan = {
  schemaVersion: 1,
  id: 'fixture-lshape',
  name: 'L-Shaped Hall',
  venue: {
    id: 'v2',
    name: 'L-Hall',
    outline: [
      { x: 0, y: 0 },
      { x: 7200, y: 0 },
      { x: 7200, y: 3600 },
      { x: 3600, y: 3600 },
      { x: 3600, y: 7200 },
      { x: 0, y: 7200 },
    ],
    obstacles: [],
    openings: [],
    perimeterSetback: 120,
    scale: null,
  },
  boothTypes: [
    {
      id: 'bt-10x10',
      name: '10x10 Inline',
      width: 120,
      depth: 120,
      style: 'inline',
      quantity: 100,
      priority: 1,
      color: '#4a90d9',
    },
  ],
  rules: { ...defaultRules },
  overrides: [],
  exhibitors: [],
  units: 'imperial',
}

// ---------------------------------------------------------------------------
// Fixture 3: Hall with four column obstacles
// ---------------------------------------------------------------------------
export const hallWithColumns: ShowPlan = {
  schemaVersion: 1,
  id: 'fixture-columns',
  name: 'Hall With Columns',
  venue: {
    id: 'v3',
    name: 'Column Hall',
    outline: [
      { x: 0, y: 0 },
      { x: 7200, y: 0 },
      { x: 7200, y: 7200 },
      { x: 0, y: 7200 },
    ],
    obstacles: [
      {
        id: 'col-1',
        kind: 'column',
        polygon: [
          { x: 1800, y: 1800 }, { x: 1824, y: 1800 },
          { x: 1824, y: 1824 }, { x: 1800, y: 1824 },
        ],
        buffer: 24,
      },
      {
        id: 'col-2',
        kind: 'column',
        polygon: [
          { x: 5376, y: 1800 }, { x: 5400, y: 1800 },
          { x: 5400, y: 1824 }, { x: 5376, y: 1824 },
        ],
        buffer: 24,
      },
      {
        id: 'col-3',
        kind: 'column',
        polygon: [
          { x: 1800, y: 5376 }, { x: 1824, y: 5376 },
          { x: 1824, y: 5400 }, { x: 1800, y: 5400 },
        ],
        buffer: 24,
      },
      {
        id: 'col-4',
        kind: 'column',
        polygon: [
          { x: 5376, y: 5376 }, { x: 5400, y: 5376 },
          { x: 5400, y: 5400 }, { x: 5376, y: 5400 },
        ],
        buffer: 24,
      },
    ],
    openings: [],
    perimeterSetback: 120,
    scale: null,
  },
  boothTypes: [
    {
      id: 'bt-10x10',
      name: '10x10 Inline',
      width: 120,
      depth: 120,
      style: 'inline',
      quantity: 150,
      priority: 1,
      color: '#4a90d9',
    },
  ],
  rules: { ...defaultRules },
  overrides: [],
  exhibitors: [],
  units: 'imperial',
}

// ---------------------------------------------------------------------------
// Fixture 4: Back-to-back rows
// ---------------------------------------------------------------------------
export const backToBackHall: ShowPlan = {
  ...rectangularHall,
  id: 'fixture-b2b',
  name: 'Back-to-Back Hall',
  rules: { ...defaultRules, backToBack: true },
}

// ---------------------------------------------------------------------------
// Fixture 5: Single rows (not back-to-back) with a row gap
// ---------------------------------------------------------------------------
export const singleRowHall: ShowPlan = {
  ...rectangularHall,
  id: 'fixture-single',
  name: 'Single-Row Hall',
  rules: {
    ...defaultRules,
    backToBack: false,
    rowGap: 48, // 4 ft
  },
}

// ---------------------------------------------------------------------------
// Fixture 6: Gap rule mid-floor
// ---------------------------------------------------------------------------
export const hallWithGapRule: ShowPlan = {
  ...rectangularHall,
  id: 'fixture-gap',
  name: 'Hall with Mid-Floor Gap',
  rules: {
    ...defaultRules,
    gaps: [
      {
        id: 'gap-1',
        axis: 'row',
        afterIndex: 3,
        size: 360, // 30 ft food court
        label: 'Food Court',
      },
    ],
  },
}

// ---------------------------------------------------------------------------
// Fixture 7: Mixed booth types
// ---------------------------------------------------------------------------
export const mixedBoothHall: ShowPlan = {
  ...rectangularHall,
  id: 'fixture-mixed',
  name: 'Mixed Booth Sizes',
  boothTypes: [
    {
      id: 'bt-10x10',
      name: '10x10 Inline',
      width: 120,
      depth: 120,
      style: 'inline',
      quantity: 80,
      priority: 2,
      color: '#4a90d9',
    },
    {
      id: 'bt-10x20',
      name: '10x20 Inline',
      width: 120,
      depth: 240,
      style: 'inline',
      quantity: 30,
      priority: 1,
      color: '#e8934a',
    },
    {
      id: 'bt-20x20',
      name: '20x20 Island',
      width: 240,
      depth: 240,
      style: 'island',
      quantity: 5,
      priority: 0,
      color: '#7ec87e',
    },
  ],
}

// ---------------------------------------------------------------------------
// Fixture 8: Deliberately impossible ask (too many booths for the hall)
// ---------------------------------------------------------------------------
export const impossibleHall: ShowPlan = {
  ...rectangularHall,
  id: 'fixture-impossible',
  name: 'Impossible Ask',
  venue: {
    ...rectangularHall.venue,
    // Much smaller hall: 100 × 100 ft
    outline: [
      { x: 0, y: 0 },
      { x: 1200, y: 0 },
      { x: 1200, y: 1200 },
      { x: 0, y: 1200 },
    ],
  },
  boothTypes: [
    {
      id: 'bt-10x10',
      name: '10x10 Inline',
      width: 120,
      depth: 120,
      style: 'inline',
      quantity: 500, // way too many for a 100×100 hall
      priority: 1,
      color: '#4a90d9',
    },
  ],
}
