# Test Infrastructure & Opaque-Box E2E Testing Strategy

**Project:** Garmin Running Tracker (`garmin_running_tracker`)  
**Track:** Track A — E2E Testing Track  
**Document Status:** Baseline Test Architecture Specification  
**Reference Standards:** `ORIGINAL_REQUEST.md`, `PROJECT.md`, W3C Geolocation API, OGC GPX 1.1 Specification.

---

## 1. Test Philosophy & Principles

The testing framework for the Garmin Running Tracker is built upon **strict opaque-box (black-box) principles**:

1. **Requirement-Driven & Implementation-Agnostic**:
   - Tests interact with the application exclusively through user-observable interfaces: the browser DOM, mouse and keyboard inputs, file drag-and-drop / file upload dialogs, and HTTP network boundaries.
   - Tests make **zero assumptions** about internal implementation details (e.g. variable names, private class methods, internal state containers).
   - Selectors utilize robust accessible roles, semantic HTML elements, data-testids, and cascading fallback selectors (`SELECTORS` in `tests/e2e/helpers.js`).

2. **Explicit Expected Output Derivation**:
   - Every assertion derives its expected values from authoritative mathematical definitions or specification baselines:
     - **Distance**: WGS-84 Haversine spherical distance formula ($R = 6,371,000\text{ m}$) with 2-decimal kilometer formatting.
     - **Pace**: Exact conversion of speed ($m/s$) and elapsed time / distance into `mm:ss /km`.
     - **Corridor Adherence**: Perpendicular Cross-Track Error (XTE) with a $25\text{m}$ buffer threshold.
     - **Distance Delta ($\Delta D$)**: $d_{actual} - d_{planned}$ in km, and percentage relative deviation.

3. **Progressive Testability & Decoupled Execution**:
   - The test harness is operable in both fully mocked offline environments (via Playwright `page.route()`) and against live Express API servers.
   - All tests set up their own state, run in isolated browser contexts, and produce zero side-effects on test execution order.

---

## 2. Test Architecture & Runner Configuration

### 2.1 Framework & Browser Engine
- **Test Framework**: `@playwright/test` (v1.63.0+).
- **Execution Engine**: Headless browser automation targeting system-installed **Google Chrome** (`channel: 'chrome'`) and **Microsoft Edge** (`channel: 'msedge'`).
- **Configuration File**: `playwright.config.js` at project root.
- **Server Lifecycle**: Automated web server detection and launcher (`http://localhost:3000`).

### 2.2 Directory Structure
```
garmin_running_tracker/
├── playwright.config.js       # Playwright test configuration
├── TEST_INFRA.md              # Test architecture & feature coverage specification
├── TEST_READY.md              # Test execution readiness declaration
└── tests/
    ├── fixtures/              # Deterministic test data & activity files
    │   ├── sample_5k.gpx      # Valid 5.12 km GPX 1.1 running activity with HR & cadence
    │   ├── detour_run.gpx     # Detour running track with >25m corridor divergence
    │   ├── corrupt.gpx        # Truncated, invalid XML file for negative testing
    │   ├── no_trkpt.gpx       # GPX file with 0 trackpoints
    │   ├── sample_activity.json # Garmin Connect Activity JSON export
    │   └── corrupt_activity.json# Malformed JSON activity missing required fields
    ├── e2e/
    │   ├── helpers.js         # Selector dictionary, mathematical formulas, network mocks
    │   ├── tier1_feature_coverage.spec.js  # Feature coverage (Happy Path)
    │   ├── tier2_boundary_corner.spec.js   # Boundary, edge & corner cases
    │   ├── tier3_cross_feature.spec.js     # Pairwise & combinatorial interactions
    │   └── tier4_real_world.spec.js        # Real-world end-to-end athlete workflows
    └── test_runner.js         # Unified CLI test runner script
```

---

## 3. Feature Inventory Coverage Mapping

All 32 inventoried features defined in `PROJECT.md` are mapped to automated opaque-box test cases across Tiers 1–4:

| Feature # | Feature Name | Target Tier | Spec File | Test Identifier | Verification Strategy |
|:---|:---|:---|:---|:---|:---|
| **1** | Responsive Map Container | Tier 1, Tier 4 | `tier1_feature_coverage.spec.js`<br>`tier4_real_world.spec.js` | `T1.01`<br>`T4.03` | Verifies `#map-container` DOM visibility, bounding box $> 200\text{px}$, responsive resize. |
| **2** | Leaflet Default Provider | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.01` | Asserts `.leaflet-tile-pane` and `.leaflet-container` mount with zero setup. |
| **3** | Google Maps Dynamic Loader | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.02` | Verifies dynamic loader hooks and configuration check. |
| **4** | Automatic Fallback Mechanism | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.02` | Asserts graceful fallback to Leaflet tiles when Google key is omitted or invalid. |
| **5** | Manual Provider Toggle | Tier 1, Tier 3 | `tier1_feature_coverage.spec.js`<br>`tier3_cross_feature.spec.js` | `T1.03`<br>`T3.02` | Clicks provider toggle; verifies map remains interactive and route persists. |
| **6** | Point A Selection (Start) | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.04` | Fills address search / clicks map; verifies Start coordinate capture. |
| **7** | Point B Selection (Finish) | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.04` | Fills address search / clicks map; verifies Finish coordinate capture. |
| **8** | Draggable Waypoints | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.05` | Asserts marker pins render on map; verifies coordinate update hooks. |
| **9** | Point Swap & Reset | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.06` | Clicks Swap button (reverses inputs); clicks Reset button (clears inputs). |
| **10** | OSRM Route Calculation | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.07` | Triggers calculation; verifies OSRM foot routing API response ingestion. |
| **11** | Resilient Routing Fallback | Tier 2, Tier 4 | `tier2_boundary_corner.spec.js`<br>`tier4_real_world.spec.js` | `T2.03`<br>`T4.02` | Aborts OSRM network request; verifies Haversine straight-line interpolation. |
| **12** | Planned Route Tracing | Tier 1, Tier 3 | `tier1_feature_coverage.spec.js`<br>`tier3_cross_feature.spec.js` | `T1.07`<br>`T3.01` | Verifies Sapphire Blue polyline SVG/path rendering on active map layer. |
| **13** | Distance Calculation (km) | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.07` | Asserts numerical distance element formatted as `X.XX km`. |
| **14** | Mock OAuth 2.0 PKCE Flow | Tier 1, Tier 4 | `tier1_feature_coverage.spec.js`<br>`tier4_real_world.spec.js` | `T1.08`<br>`T4.01` | Clicks "Connect Garmin", verifies modal, clicks Authorize, verifies token. |
| **15** | Garmin Sync REST API | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.09` | Queries `/api/garmin/activities`, renders activity list. |
| **16** | Pre-seeded Workout Library | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.09` | Asserts presence of pre-seeded 5K and 10K running workout items. |
| **17** | GPX 1.1 File Import | Tier 1, Tier 3 | `tier1_feature_coverage.spec.js`<br>`tier3_cross_feature.spec.js` | `T1.10`<br>`T3.03` | Uploads `sample_5k.gpx`; verifies parsing of trackpoints and elevation. |
| **18** | Garmin JSON Import | Tier 1, Tier 2 | `tier1_feature_coverage.spec.js`<br>`tier2_boundary_corner.spec.js` | `T1.10`<br>`T2.06` | Ingests `sample_activity.json`; verifies parsing; rejects malformed schema. |
| **19** | Telemetry Extraction | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.10` | Verifies distance, pace (`mm:ss /km`), and elapsed time calculation. |
| **20** | Dual Polyline Overlay | Tier 1, Tier 3 | `tier1_feature_coverage.spec.js`<br>`tier3_cross_feature.spec.js` | `T1.11`<br>`T3.01` | Asserts coexistence of Blue planned polyline and Orange actual Garmin track. |
| **21** | Viewport Auto-Framing | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.11` | Verifies dynamic `fitBounds` encloses both planned route and Garmin GPS track. |
| **22** | Distance Comparison Metric | Tier 1, Tier 3 | `tier1_feature_coverage.spec.js`<br>`tier3_cross_feature.spec.js` | `T1.12`<br>`T3.04` | Verifies distance delta ($\Delta D$) indicator badge and comparative progress bar. |
| **23** | Pace & Time Analysis | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.12` | Verifies actual pace against target pace formatting in comparison HUD. |
| **24** | Corridor Adherence Scoring | Tier 1, Tier 2 | `tier1_feature_coverage.spec.js`<br>`tier2_boundary_corner.spec.js` | `T1.12`<br>`T2.08` | Calculates 25m corridor compliance percentage (e.g. `95%` vs `< 80%`). |
| **25** | Out-of-Corridor Highlighting | Tier 2, Tier 3 | `tier2_boundary_corner.spec.js`<br>`tier3_cross_feature.spec.js` | `T2.08`<br>`T3.04` | Detects points $> 25\text{m}$ away and flags detour segments. |
| **26** | Workout Record Assembler | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.13` | Assembles composite record binding planned route, telemetry, and metrics. |
| **27** | Atomic File Persistence | Tier 1, Tier 3 | `tier1_feature_coverage.spec.js`<br>`tier3_cross_feature.spec.js` | `T1.13`<br>`T3.03` | Saves workout; verifies storage response and retrieval. |
| **28** | LocalStorage Redundancy | Tier 1, Tier 3 | `tier1_feature_coverage.spec.js`<br>`tier3_cross_feature.spec.js` | `T1.13`<br>`T3.03` | Verifies workout persists in client-side storage across page reload (`F5`). |
| **29** | Minimalist History Dashboard | Tier 1, Tier 2 | `tier1_feature_coverage.spec.js`<br>`tier2_boundary_corner.spec.js` | `T1.14`<br>`T2.09` | Renders workout cards in chronological order; shows empty state if empty. |
| **30** | Mini Route Preview | Tier 1 | `tier1_feature_coverage.spec.js` | `T1.14` | Asserts mini SVG / canvas route thumbnail attached to history card. |
| **31** | Workout Re-Inspection | Tier 1, Tier 4 | `tier1_feature_coverage.spec.js`<br>`tier4_real_world.spec.js` | `T1.14`<br>`T4.01` | Clicks workout card; reloads dual polylines and HUD metrics on main map. |
| **32** | Workout Deletion / Clear | Tier 1, Tier 3 | `tier1_feature_coverage.spec.js`<br>`tier3_cross_feature.spec.js` | `T1.14`<br>`T3.05` | Clicks delete button; verifies removal from list while keeping others. |

---

## 4. Test Tier Architecture & Structure

```
                  ┌──────────────────────────────────────────────┐
                  │          TIER 4: REAL-WORLD RUNNER           │
                  │   End-to-End User Journeys, Network Drop,    │
                  │        Mobile Viewport Responsiveness        │
                  └───────────────────────┬──────────────────────┘
                                          │
                  ┌───────────────────────┴──────────────────────┐
                  │         TIER 3: CROSS-FEATURE PAIRWISE       │
                  │  Route + OAuth Sync, Provider Toggle Memory, │
                  │  GPX + Persistence Reload, Detour + Delta    │
                  └───────────────────────┬──────────────────────┘
                                          │
                  ┌───────────────────────┴──────────────────────┐
                  │       TIER 2: BOUNDARY, CORNER & NEGATIVE    │
                  │  Identical Points (0km), XSS/SQLi Queries,   │
                  │  OSRM 500 Outage, Corrupt GPX, Detour > 1km  │
                  └───────────────────────┬──────────────────────┘
                                          │
                  ┌───────────────────────┴──────────────────────┐
                  │          TIER 1: FEATURE COVERAGE            │
                  │  Happy-path coverage of all 32 inventoried   │
                  │   features (Map, Route, Garmin, Comparison)  │
                  └──────────────────────────────────────────────┘
```

### 4.1 Tier 1: Feature Coverage (14 Test Cases)
- Happy-path verification ensuring every discrete capability performs its baseline function.
- File: `tests/e2e/tier1_feature_coverage.spec.js`

### 4.2 Tier 2: Boundary, Edge & Corner Cases (9 Test Cases)
- Limits, extreme values, negative input handling, and graceful failure modes.
- Covers identical coordinates, malformed XML, corrupt JSON, treadmill/indoor runs (0 GPS points), severe detours, and empty states.
- File: `tests/e2e/tier2_boundary_corner.spec.js`

### 4.3 Tier 3: Cross-Feature Pairwise Interactions (5 Test Cases)
- Pairwise combinatorial interactions across map engine toggles, routing engines, file imports, and multi-record persistence.
- File: `tests/e2e/tier3_cross_feature.spec.js`

### 4.4 Tier 4: Real-World Scenarios & Resiliency (3 Test Cases)
- Complete athlete journeys:
  - **T4.01**: The Complete 5K Runner Journey (Route Planning $\to$ Garmin Connect $\to$ Activity Sync $\to$ Visual Comparison $\to$ Save to History $\to$ Page Reload $\to$ Workout Re-inspection).
  - **T4.02**: Network Disruption & Local Recovery (Routing service unavailable $\to$ automatic Haversine fallback $\to$ manual watch GPX import $\to$ local persistence).
  - **T4.03**: Mobile Athlete Usability (375x667 iPhone SE viewport testing).
- File: `tests/e2e/tier4_real_world.spec.js`

---

## 5. Test Runner & Execution Commands

### 5.1 CLI Test Runner
The project provides a unified test runner script:
```powershell
# Run the entire test suite (Tiers 1-4) with default Chrome channel
node tests/test_runner.js

# Run with npm
npm test

# Run a specific test tier
node tests/test_runner.js --tier=1
node tests/test_runner.js --tier=2
node tests/test_runner.js --tier=3
node tests/test_runner.js --tier=4

# Run with Microsoft Edge channel
node tests/test_runner.js --browser=edge

# List all discovered tests without running
node tests/test_runner.js --list
```

### 5.2 Direct Playwright CLI
```powershell
# Run all E2E specs
npx playwright test

# Run specific spec with Chrome
npx playwright test tests/e2e/tier1_feature_coverage.spec.js --project=chrome

# Run headed for visual debugging
npx playwright test --headed
```

---

## 6. Coverage Thresholds & Milestone Gates

| Milestone | Gate Criteria | Required Pass Rate |
|:---|:---|:---|
| **M1: Map Interface & Routing** | Passes M1 features in Tier 1 (T1.01–T1.07) and Tier 2 (T2.01–T2.03) | 100% of M1 Tests |
| **M2: Garmin Sync & Import** | Passes M2 features in Tier 1 (T1.08–T1.10) and Tier 2 (T2.04–T2.07) | 100% of M2 Tests |
| **M3: Comparison & History** | Passes M3 features in Tier 1 (T1.11–T1.14) and Tier 3 (T3.01–T3.05) | 100% of M3 Tests |
| **M4: Full E2E Test Suite** | Passes ALL 31 tests across Tiers 1–4 without exceptions | **100% (31/31)** |
| **M5: Adversarial Hardening** | White-box stress testing, zero regression against Tiers 1–4 | 100% + Stress Gates |
