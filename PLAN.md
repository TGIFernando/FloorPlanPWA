# Build Plan — Trade Show Floor Plan PWA

**Hand this whole file to Claude Code.** Work the phases in order. Do not skip Phase 0 or Phase 1 — the layout engine must exist and be tested before any UI is written.

---

## 1. What we're building

An offline-capable Progressive Web App for trade show and exhibition floor planners. The user draws or enters a building footprint, declares how many booths they need and at what sizes, sets row/aisle/gap rules, and the app generates a legal, printable floor plan. When the requested booths don't fit, the app explains exactly why and offers one-click fixes.

**Primary user:** a show organizer or general service contractor sitting in a venue with bad Wi-Fi, holding a tablet, arguing with a fire marshal.

**Success test:** a planner can go from a blank screen to a numbered, to-scale, printable floor plan for a 100,000 sq ft hall with 400 booths in under ten minutes, and can answer "why won't 420 fit?" without leaving the app.

---

## 2. Non-negotiable engineering rules

1. **The layout engine is a pure TypeScript module** in `src/engine/`, with zero imports from React, the DOM, or any UI library. It takes a plan object in and returns a layout object out. It is deterministic: same input → byte-identical output, always.
2. **All internal geometry is integer inches.** No floats in stored state. Convert at the display boundary only. Float drift in a packing algorithm produces booths that overlap by 0.0001" and a rendering that lies.
3. **The engine ships with unit tests before the UI is built.** Golden-file tests: a fixture plan in, a snapshot layout out.
4. **Regeneration must never silently destroy user edits.** Manual changes are stored as an override layer, not baked into the generated result. See §6.
5. **Every failure returns a diagnosis, never a bare `null` or `throw`.** The engine's job when something doesn't fit is to explain it.
6. **Commit at the end of each phase** with a message naming the phase. Run typecheck, lint, and tests before each commit.

---

## 3. Stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite + React 18 + TypeScript (strict) | Fast, standard, good PWA plugin |
| PWA | `vite-plugin-pwa` (Workbox, `injectManifest`) | Installable, full offline shell |
| Canvas | `react-konva` | Hundreds of interactive booths with drag/select needs canvas, not SVG DOM nodes |
| Print/export | Separate SVG serializer in `src/export/` | Vector output for PDF and plotters; do not screenshot the canvas |
| PDF | `pdf-lib` + the SVG serializer | True-to-scale output with a title block |
| State | Zustand + Immer | Small, no boilerplate, easy to snapshot |
| Undo/redo | Command stack over the plan object (`src/store/history.ts`) | Every mutation is a named, invertible command |
| Persistence | IndexedDB via `idb` | Offline-first; localStorage is too small for venue geometry |
| Polygon math | `polygon-clipping` | Boolean ops for buildable-area computation |
| Testing | Vitest + Testing Library + Playwright (smoke only) | |
| Styling | Tailwind + CSS variables for the token set | |

No backend in v1. Sharing is by exporting/importing a `.showplan` JSON file. Design the schema with a `schemaVersion` field so sync can be added later.

---

## 4. Data model

Create `src/engine/types.ts` first. Everything else follows from it.

```ts
type Inches = number; // integer, always

interface Point { x: Inches; y: Inches; }

interface Venue {
  id: string;
  name: string;
  /** Outer wall, closed polygon, clockwise. Supports non-rectangular halls. */
  outline: Point[];
  /** Columns, stages, permanent bars, escalators — booths may not overlap these. */
  obstacles: Obstacle[];
  /** Doors, fire exits, loading docks. Used for egress checks and clear-zone reservation. */
  openings: Opening[];
  /** Minimum clear distance from any wall to the nearest booth. */
  perimeterSetback: Inches;
  ceilingZones?: CeilingZone[];   // max hanging/booth height by region
  utilities?: UtilityPoint[];     // floor ports: power, water, air, data
  scale: { pixelsPerInch: number } | null; // for traced background images
}

interface Obstacle {
  id: string;
  kind: 'column' | 'wall' | 'stage' | 'fixed-structure' | 'reserved';
  polygon: Point[];
  label?: string;
  /** Extra clearance required around it. */
  buffer: Inches;
}

interface Opening {
  id: string;
  kind: 'entrance' | 'fire-exit' | 'loading-dock' | 'service';
  segment: [Point, Point];
  /** Required unobstructed depth in front of this opening. */
  clearDepth: Inches;
  egressCapacity?: number;
}

interface BoothType {
  id: string;
  name: string;            // "10x10 Inline", "20x20 Island"
  width: Inches;           // along the row
  depth: Inches;           // perpendicular to the aisle
  style: 'inline' | 'corner' | 'peninsula' | 'island';
  quantity: number;        // how many the user wants
  priority: number;        // placed first when space is tight
  color: string;
  pricePerUnit?: number;   // for revenue rollups
}

interface LayoutRules {
  mainAisleWidth: Inches;      // default 120 (10 ft)
  crossAisleWidth: Inches;     // default 120
  backToBack: boolean;         // pair rows back-to-back with no gap between depths
  rowGap: Inches;              // gap when not back-to-back
  orientation: 'horizontal' | 'vertical' | 'auto';
  maxBoothsPerRun: number;     // insert a cross aisle after this many booths
  /** Explicit user-defined gaps: named breaks inserted at a row or column index. */
  gaps: GapRule[];
  /** Hard caps the user typed in, if any. */
  targetRows?: number;
  targetAisles?: number;
  boothNumbering: NumberingScheme;
  cornerPremiumAuto: boolean;  // auto-tag booths with two aisle faces
}

interface GapRule {
  id: string;
  axis: 'row' | 'column';
  afterIndex: number;
  size: Inches;
  label?: string;   // "Food court", "Lounge", "Registration"
}

interface NumberingScheme {
  style: 'sequential' | 'aisle-odd-even' | 'block-prefix';
  startAt: number;
  prefix?: string;
  direction: 'serpentine' | 'reset-per-row';
}

interface PlacedBooth {
  id: string;
  typeId: string;
  number: string;
  origin: Point;
  width: Inches;
  depth: Inches;
  rotation: 0 | 90 | 180 | 270;
  rowIndex: number;
  runIndex: number;
  faces: ('north'|'south'|'east'|'west')[]; // which sides touch an aisle
  isCorner: boolean;
  status: 'available' | 'held' | 'sold';
  exhibitorId?: string;
  /** True when the user edited this booth; the engine will not move it. */
  pinned: boolean;
}

interface ShowPlan {
  schemaVersion: 1;
  id: string;
  name: string;
  venue: Venue;
  boothTypes: BoothType[];
  rules: LayoutRules;
  overrides: BoothOverride[];   // see §6
  exhibitors: Exhibitor[];
  units: 'imperial' | 'metric'; // display only
}

interface LayoutResult {
  booths: PlacedBooth[];
  aisles: Rect[];
  placedCount: Record<string, number>;   // by boothTypeId
  unplacedCount: Record<string, number>;
  metrics: LayoutMetrics;
  problems: Problem[];
  suggestions: Suggestion[];
}
```

---

## 5. The layout engine

`src/engine/layout.ts`, exporting `generateLayout(plan: ShowPlan): LayoutResult`.

### Algorithm

1. **Buildable region.** Start with `venue.outline`. Subtract: perimeter setback (inward offset), every obstacle inflated by its buffer, and a clear rectangle in front of every opening sized by `clearDepth`. Use `polygon-clipping`. Result is a multi-polygon.
2. **Band decomposition.** Sweep perpendicular to the chosen orientation and cut the buildable multi-polygon into maximal axis-aligned rectangular bands. Non-rectangular halls produce several bands of differing width; this is why we decompose rather than assume one big rectangle.
3. **Row planning.** Within each band, walk along the axis laying down: `[row depth][row depth][aisle]` when `backToBack`, or `[row depth][rowGap][row depth][aisle]` otherwise. Insert `GapRule` breaks at their indices. Stop when the remaining band depth can't hold another row plus its aisle. Track leftover depth — it feeds the suggestion engine.
4. **Run filling.** For each row, walk left→right placing booths from the type queue (sorted by `priority`, then largest first — first-fit-decreasing packs measurably better than naive order). Insert a cross aisle after `maxBoothsPerRun` booths. Clip runs against the band edge; a partial slot smaller than the narrowest booth type becomes recorded dead space.
5. **Islands.** Booth types with `style: 'island'` need aisle access on all four sides. Place these first, in the widest bands, before inline rows are planned — retrofitting islands into a row grid does not work.
6. **Face and corner detection.** For each placed booth, test each edge against the aisle rectangles. Two or more adjacent aisle faces → `isCorner: true`.
7. **Numbering.** Apply the scheme. Serpentine numbering (odd numbers one side of an aisle, even on the other) is what the industry actually uses; make `aisle-odd-even` the default.
8. **Metrics.** Compute: total placed, per-type placed vs requested, gross floor area, net sellable area, aisle area, dead space, sell efficiency (`net sellable / gross`), and revenue if prices are set.

### Performance target

10,000 sq ft to 500,000 sq ft halls, up to 2,000 booths, full regeneration under 150 ms. Run the engine in a Web Worker (`src/engine/worker.ts`) so drag interactions never block. Debounce regeneration at 80 ms while a slider is moving.

---

## 6. Manual booth edits and the override layer

This is the part that usually gets built wrong. Never mutate `LayoutResult` directly.

```ts
interface BoothOverride {
  boothId: string;
  width?: Inches;
  depth?: Inches;
  origin?: Point;
  rotation?: 0 | 90 | 180 | 270;
  typeId?: string;
  deleted?: boolean;
  pinned: true;
}
```

When the user resizes booth `A-104` from 10x10 to 10x20:

1. Write a `BoothOverride` into `plan.overrides` and mark it pinned.
2. Re-run `generateLayout`. The engine treats pinned booths as fixed obstacles and re-flows only the unpinned booths in the affected run and any run downstream of it.
3. If the resize pushes the run past the band edge, the engine reports it — it does not silently drop a booth. Show the resulting `Problem` inline: the last booth in the run turns amber with a badge, and the diagnostics panel explains the cascade.
4. Provide **Unpin** on any edited booth and **Reset all manual edits** in the toolbar. Show a persistent count of pinned booths so the user always knows how much of the plan is hand-held.

Re-flow scope rule: an edit affects its own run, subsequent runs in the same row, and subsequent rows only if the row's depth changed. Keep the blast radius small and visible — highlight what moved after each regeneration for about 600 ms.

---

## 7. Feasibility and suggestions engine

`src/engine/diagnose.ts`. This is the headline feature. Build it as its own module with its own tests.

### Problems

```ts
interface Problem {
  code: ProblemCode;
  severity: 'error' | 'warning' | 'info';
  message: string;         // plain language, names the numbers
  affectedBoothIds: string[];
  region?: Rect;           // for highlight-on-hover
}

type ProblemCode =
  | 'INSUFFICIENT_AREA'        // math says it can never fit
  | 'INSUFFICIENT_ROWS'        // fits by area, not by row count
  | 'RUN_OVERFLOW'             // a row is too long for its band
  | 'AISLE_BELOW_MINIMUM'
  | 'OBSTACLE_CONFLICT'
  | 'EGRESS_BLOCKED'
  | 'DEAD_END_AISLE'
  | 'ORPHAN_BOOTH'             // placed but has no aisle frontage
  | 'GAP_TOO_LARGE'
  | 'ISLAND_NO_CLEARANCE';
```

Always run the **capacity pre-check** before placement: required booth area + required aisle area vs buildable area. If required exceeds available, say so up front with the shortfall in square feet — do not let the user watch a packing animation fail.

### Suggestions

Every suggestion is a computed, applicable action with a quantified payoff. Not advice — a button.

```ts
interface Suggestion {
  id: string;
  label: string;          // "Narrow main aisles from 10 ft to 8 ft"
  detail: string;         // "Frees 3,400 sq ft — enough for 34 more 10x10 booths"
  boothsGained: number;   // negative for suggestions that remove booths
  tradeoff: string;       // "Check against your venue's fire code minimum"
  confidence: 'exact' | 'estimated';
  apply: () => ShowPlan;  // returns a new plan; run through the normal command stack
}
```

Generate and rank these strategies, sorted by `boothsGained` descending, then by least disruption:

1. **Reduce aisle width** — for each 6" decrement down to a configured floor, compute booths gained. Flag anything under the venue's stated minimum.
2. **Reduce cross-aisle frequency** — raise `maxBoothsPerRun`, recompute.
3. **Flip orientation** — run the whole layout at 90°. In non-square halls this routinely swings the count by 5–15%.
4. **Shrink or drop gaps** — for each `GapRule`, compute what removing it recovers.
5. **Substitute booth types** — "Convert 8 of your 10x20s to 10x10s: fits 4 more units in the same footprint."
6. **Trim the ask** — "Remove 12 booths" as the last resort, and always name the cheapest ones to cut (lowest `priority`, or lowest `pricePerUnit` if set).
7. **Recover dead space** — if a band's leftover strip could hold a shorter row of a smaller type, propose adding it.
8. **Reduce perimeter setback** — usually small, sometimes decisive in narrow halls.

Show the top three inline in the diagnostics panel, the rest behind "More options." Each applies through the undo stack so any suggestion can be reverted with Ctrl+Z.

---

## 8. UI

### Screens

- **Plans list** — recent plans, duplicate, import/export, templates.
- **Venue editor** — draw the outline (click-to-place with orthogonal snapping and typed dimension entry), place obstacles and openings, set setback. Support importing a floor plan image as a traceable background with two-point scale calibration. Typed entry is not optional: "120 ft × 80 ft" must be enterable without drawing anything.
- **Booth setup** — booth type table: name, W × D, style, quantity, price, color, priority. Running total of requested area vs available area, live.
- **Layout view** — the main screen. Canvas center, collapsible left panel (rules and sliders), right panel (diagnostics and suggestions), bottom status bar (placed / requested, sell efficiency, revenue).
- **Exhibitors** — assignment table, CSV import, sold/held/available, search-and-highlight on the map.
- **Export** — PDF to scale with title block and legend, SVG, DXF, CSV booth manifest, PNG.

### Layout view interactions

- Pan (space-drag / two-finger), zoom to cursor, zoom-to-fit, fit-to-selection
- Click select, shift multi-select, marquee select
- Drag a booth → pins it; drag handles resize on the grid; arrow keys nudge by one grid unit
- Right-click booth: change type, rotate, split, merge with neighbor, delete, hold/sell, unpin
- Measure tool, dimension display on every aisle, ruler gutters
- Toggleable overlays: booth numbers, dimensions, exhibitor names, utilities, egress paths, heat map of premium/corner booths
- Live sliders for aisle width, gaps, and rows that regenerate as you drag

### Visual direction

This is a technical instrument, not a marketing page. Aim for the register of surveying and architectural drafting: a cool near-neutral ground (not white — a faint blue-grey drafting tint), a hairline grid that gets finer as you zoom, and a single saturated accent reserved exclusively for selection. Booth fill colors come from the user's booth types, so the chrome around them must stay desaturated or the map turns to noise. Set data and dimensions in a monospaced or tabular-figure face so numbers align in columns; use one characterful grotesque for panel headings. The signature element is the **diagnostics panel**: instead of a list of red error text, render each problem as a small annotated thumbnail of the affected region, the way a plan check markup looks. Warmth is wrong here; precision is the personality. Respect `prefers-reduced-motion`, keep hit targets tablet-sized (44px minimum), and make sure every canvas action has a keyboard equivalent.

Copy rules: errors state the measured shortfall and the fix, never apologize, never say "oops." Empty states are invitations — a blank venue editor says "Draw the hall outline, or enter its dimensions."

---

## 9. Dimensioning and the decorator's drawing

The generated map is not just a picture — it is the document a crew works from on an empty concrete floor at 5am with a tape measure and a chalk box. Treat dimensioning as a first-class output, not a rendering flourish.

### Datum and coordinate system

- Every plan has a **datum origin** the user picks explicitly: a building corner, a dock threshold, or a named column. Store it on `Venue`. Every reported coordinate is an offset from it.
- **Use ordinate (baseline) dimensioning, not chained dimensioning.** Chained strings accumulate tape error across a 400-foot hall — by row 12 the crew is off by six inches. Every row line and aisle line gets its own dimension measured from the datum.
- Support an optional **column grid** on the venue (letters one way, numbers the other, with real spacing). Halls have columns, and crews measure off them because they're the only fixed thing on the floor. When a grid exists, also express each row's position as an offset from the nearest column line.

### On-screen dimension layer

A toggleable layer, on by default in the print output. Auto-generate:

- Overall hall dimensions, and the perimeter setback on each wall
- **First row offset:** wall face (or column line) to the back of the first row — the single most important number on the sheet
- Row depth, aisle width, cross-aisle width, every `GapRule` width, and each run's total length
- **Aisle centerlines with a dimension to the centerline**, since that's the line crews actually snap
- Individual callouts on every overridden or non-standard booth. Uniform booths can share a typical note ("TYP. 10'-0"); the odd ones are what get built wrong.

Formatting rules: feet and inches as `12'-6"`, never `12.5'`. Dimension text stays horizontally readable regardless of the dimension's orientation, never renders below a legible size when zoomed out, and uses simple collision avoidance (offset the leader, stack the string) so numbers don't pile up in tight aisles.

### Layout schedule — the export that earns its keep

Generate these alongside the drawing:

1. **Chalk line schedule.** Every line to snap, in the order to snap it, each as a single offset from the datum: row back lines, row face lines, aisle centerlines, cross-aisle lines. A crew should be able to lay the whole floor from this table without reading the drawing.
2. **Booth corner coordinate table.** Booth number, X and Y of its datum-corner, width, depth, rotation. CSV plus a printed appendix. Any crew with a laser distance meter or a total station can lay out directly from this, and it removes measurement error entirely.
3. **Booth manifest** by row with type, size, exhibitor, and status.

### Sheet output

- **Key plan** of the whole hall with a scale bar, plus **enlarged quadrant sheets** at 1/8" = 1'-0" (or 1/16" for very large halls) with match lines and grid references between them. One 400-booth hall on one sheet is unreadable at the floor.
- **Title block** on every sheet: show name, hall, date, revision letter, scale, datum note, and the standard notes — "Field verify all building conditions" and "Do not scale drawing."
- **Revision clouds.** Diff against the previous saved revision and cloud what moved, with a revision table. Crews work from printed sheets; the second and third printings are where mistakes happen. This only works because the engine is deterministic (§2, rule 1) — a layout that reshuffles on every regeneration produces meaningless diffs.
- **Layered PDF and DXF** with conventional layer names (`BOOTH`, `BOOTH-NUM`, `DIM`, `AISLE`, `WALL`, `COLUMN`, `UTIL`) so the shop can toggle or restyle in CAD.
- Verify true scale: printing at 1/8" = 1'-0" on 24×36 must measure correctly with an architect's scale. Add a 1-inch calibration square in the margin.

### Tolerance handling

Round every dimension to whole inches. Designate one **make-up dimension** per run and per band — usually the last aisle or the end setback — that absorbs the rounding, and mark it as such. Flag any make-up dimension forced to absorb more than 2", because that means the crew will notice the discrepancy and stop working.

---

## 10. Additional features worth building

Ordered by value per unit of effort.

**High value, build in v1:**

- **Fire code presets and compliance checks** — configurable minimums (main aisle, cross aisle, dead-end aisle limit, travel distance to exit) with presets loosely modeled on common IFC/NFPA 101 practice. Run a continuous check and surface violations as `Problem`s. **Ship a visible disclaimer:** this is a planning aid, not a code compliance certification; the authority having jurisdiction has the final word. Do not let the app assert a plan is "legal."
- **Scenario comparison** — save named variants of a plan and diff them side by side: booth count, sell efficiency, revenue, aisle area. Planners live in "what if we go to 8-foot aisles."
- **Booth numbering schemes** with live preview, plus manual renumbering of individual booths.
- **Revenue rollup** with tier pricing and automatic corner-booth premiums.
- **CSV import/export** of booth types, exhibitor lists, and the final manifest.
- **Print pack** — to-scale PDF, an exhibitor-facing map, and a booth manifest, in one action.

**Second wave:**

- **Templates** — save a venue once, reuse it every year; ship two or three sample halls so the app isn't empty on first run.
- **Utility overlay** — floor port locations imported from CSV, with a warning when a booth requiring power sits far from a drop.
- **Load-in path check** — verify a forklift-width path from every dock to every row before the aisles fill.
- **Multi-hall shows** — several venues under one plan with combined numbering and totals.
- **Version history** — snapshot on every generation, scrub back through the day's work.
- **Sponsorship and feature zones** — first-class objects for lounges, food courts, and registration, which are really just named gaps that need to be visible in exports.
- **QR-linked exhibitor map** — export a static interactive HTML map for attendees.

**Deliberately out of scope for v1:** real-time multi-user collaboration, 3D view, a server backend, payment processing. Note them in the README as future work.

---

## 11. Phases and acceptance criteria

**Phase 0 — Scaffold.** Vite + React + TS strict, Tailwind, Vitest, ESLint/Prettier, `vite-plugin-pwa` with a manifest and icons, IndexedDB wrapper, folder structure (`engine/`, `store/`, `ui/`, `export/`, `fixtures/`).
*Done when:* the app installs as a PWA and loads offline after first visit.

**Phase 1 — Engine, headless.** Types, geometry utilities, buildable region, band decomposition, row planning, run filling, numbering, metrics. No UI.
*Done when:* `generateLayout` passes a test suite including — a plain rectangular hall; an L-shaped hall; a hall with four columns; back-to-back vs single rows; a gap rule mid-floor; a mixed booth-type queue; a deliberately impossible ask. Golden snapshots committed. Output is verified deterministic across 100 runs.

**Phase 2 — Diagnostics.** Problem detection and the full suggestion generator with `apply` functions.
*Done when:* for the impossible-ask fixture, the engine returns at least four ranked suggestions, each of which — when applied and re-run — produces exactly the `boothsGained` it promised. Test that assertion directly.

**Phase 3 — Canvas and layout view.** react-konva renderer, pan/zoom, selection, overlays, rules panel, diagnostics panel, status bar. Engine moved into a Web Worker.
*Done when:* a 500-booth plan pans and zooms at 60fps and slider drags regenerate without visible stutter.

**Phase 4 — Editing and overrides.** Pinning, drag, resize, right-click actions, undo/redo, the re-flow scope rule, highlight-what-moved.
*Done when:* resizing a mid-row booth reflows the rest of the row, leaves pinned booths untouched, and Ctrl+Z restores the exact prior state. Test undo across 50 mixed operations.

**Phase 5 — Venue editor.** Drawing, typed dimensions, obstacles, openings, background image tracing with scale calibration.
*Done when:* a user can build a non-rectangular hall with three columns and two docks entirely by typing, then entirely by drawing.

**Phase 6 — Dimensioning and drawing output.** Datum selection, column grid, ordinate dimension generation, dimension layer rendering, chalk line schedule, corner coordinate table, title block, sheet segmentation, revision clouds, layered PDF/DXF.
*Done when:* a printed 1/8" sheet measures true with an architect's scale; every dimension on it traces back to the datum; and a person given only the chalk line schedule can reconstruct the row and aisle positions exactly.

**Phase 7 — Exhibitors, pricing, export pack.** Assignment table, CSV in/out, SVG/PNG export, exhibitor-facing map.
*Done when:* the manifest CSV round-trips and the print pack generates all sheets in one action.

**Phase 8 — Polish.** Templates, sample venues, onboarding, keyboard shortcut sheet, accessibility pass, Playwright smoke tests, README.

---

## 12. Testing

- **Engine:** exhaustive unit tests. Property test the invariants — no two booths overlap; every booth lies inside the buildable region; every booth has at least one aisle face; aisle widths never fall below the configured minimum. Property tests catch the packing bugs that fixtures miss.
- **Diagnostics:** every suggestion's promised gain must be verified by applying it.
- **Store:** undo/redo round-trip fuzzing.
- **UI:** component tests for panels; Playwright smoke test for the golden path (new plan → dimensions → 200 booths → generate → export).
- **Dimensioning:** for each fixture, assert that summing the generated dimension string along an axis equals the hall's overall dimension, that every dimension originates at the datum, and that the corner coordinate table reproduces the placed booth positions exactly.
- **PWA:** verify offline load and that a plan saved offline survives a reload.

---

## 13. First instruction to Claude Code

Start by writing `CLAUDE.md` at the repo root capturing §2 (the engineering rules), the folder structure, and the commit convention. Then build Phase 0 and Phase 1 and stop. Show me the engine's test output and one golden snapshot before writing any UI code.
