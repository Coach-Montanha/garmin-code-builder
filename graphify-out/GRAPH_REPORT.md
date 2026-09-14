# Graphify Knowledge Graph Report

## 📌 Project Architecture Overview
- **Root Directory:** `C:\Users\Administrator\teamwork_projects\garmin_running_tracker`
- **Total Indexable Files:** 49
- **Total Relationships:** 69

## 🏛️ Key Modules ("God Nodes")
- **`index.html`** (13.9 KB)
- **`jsconfig.json`** (0.3 KB)
- **`ORIGINAL_REQUEST.md`** (2.4 KB)
- **`package-lock.json`** (63.9 KB)
- **`package.json`** (0.6 KB)
- **`playwright.config.js`** (0.9 KB)
- **`PROJECT.md`** (13.6 KB)
- **`public/css/leaflet.css`** (14.5 KB)
- **`public/css/style.css`** (30.0 KB)
- **`public/index.html`** (13.6 KB)

## 🔗 Dependency Map
### `playwright.config.js`
  Imports: `@playwright/test`

### `public/js/app.js`
  Imports: `./map/mapAdapter.js`, `./components/routePlanner.js`, `./components/statsOverlay.js`, `./services/routingService.js`, `./components/syncModal.js`, `./services/garminService.js`, `./components/garminSync.js`, `./components/routeComparison.js`, `./components/runHistory.js`

### `public/js/components/routePlanner.js`
  Imports: `../services/routingService.js`

### `public/js/components/statsOverlay.js`
  Imports: `../services/routingService.js`

### `public/js/components/syncModal.js`
  Imports: `../services/garminService.js`

### `public/js/map/mapAdapter.js`
  Imports: `./leafletAdapter.js`, `./googleAdapter.js`

### `public/js/services/garminService.js`
  Imports: `./routingService.js`

### `server/app.js`
  Imports: `express`, `node:path`, `node:url`, `./routes/garminRoutes.js`

### `server/routes/garminRoutes.js`
  Imports: `express`, `node:crypto`

### `tests/adversarial_interaction_stress.js`
  Imports: `@playwright/test`

### `tests/challenger_m1_interaction_lifecycle_stress.js`
  Imports: `@playwright/test`, `perf_hooks`, `fs`

### `tests/e2e/helpers.js`
  Imports: `node:path`, `node:url`

### `tests/e2e/tier1_feature_coverage.spec.js`
  Imports: `@playwright/test`, `node:path`, `./helpers.js`

### `tests/e2e/tier2_boundary_corner.spec.js`
  Imports: `@playwright/test`, `node:path`, `./helpers.js`

### `tests/e2e/tier3_cross_feature.spec.js`
  Imports: `@playwright/test`, `node:path`, `./helpers.js`

### `tests/e2e/tier4_real_world.spec.js`
  Imports: `@playwright/test`, `node:path`, `./helpers.js`

### `tests/e2e/tier5_adversarial_stress.spec.js`
  Imports: `@playwright/test`, `./helpers.js`

### `tests/empirical_concurrency_stress.js`
  Imports: `@playwright/test`

### `tests/reproduce_dragend_concurrency_defect.js`
  Imports: `@playwright/test`

### `tests/stress_adversarial_suite.js`
  Imports: `@playwright/test`

### `tests/test_runner.js`
  Imports: `node:child_process`, `node:http`, `node:path`, `node:url`, `node:fs`

### `tests/unit/adversarial_routing.test.js`
  Imports: `node:test`, `node:assert/strict`, `../../public/js/services/routingService.js`

### `tests/unit/adversarial_stress_diagnostics.js`
  Imports: `../../public/js/services/routingService.js`

### `tests/unit/garmin_server_api.test.js`
  Imports: `node:test`, `node:assert/strict`, `node:crypto`, `express`, `../../server/routes/garminRoutes.js`

### `tests/unit/gpx_parser.test.js`
  Imports: `node:test`, `node:assert/strict`, `node:fs`, `node:path`, `node:url`, `../../public/js/services/garminService.js`

### `tests/unit/routing_fallback.test.js`
  Imports: `node:test`, `node:assert/strict`, `../../public/js/services/routingService.js`

### `vite.config.js`
  Imports: `vite`

## ⚡ Zero-Token Context Usage
Utilize este relatório como referência primária de arquitetura para evitar chamadas de leitura desnecessárias.
