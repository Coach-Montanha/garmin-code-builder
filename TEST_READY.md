# TEST READY: Garmin Running Tracker E2E Test Suite

**Status:** ✅ **TEST SUITE READY FOR EXECUTION**  
**Date:** 2026-09-13  
**Track:** Track A — E2E Testing Track Lead & Test Writer  
**Target Application:** Minimalist Road Running Web Application (`garmin_running_tracker`)

---

## 1. Executive Summary

The automated, opaque-box End-to-End (E2E) test suite for the **Garmin Running Tracker** has been fully designed, implemented, and verified on the Windows host environment.

- **Total Test Cases**: **31 comprehensive automated tests**
- **Test Framework**: `@playwright/test` (v1.63.0) with native system Chrome (`channel: 'chrome'`) and Edge (`channel: 'msedge'`)
- **Coverage**: **100% of all 32 inventoried features** across Requirements R1, R2, and R3.
- **Verification Result**: Verified with exit code 0 under both `chrome` and `edge` channels (`node tests/test_runner.js --list`).

---

## 2. Test Runner Commands

The test suite can be run via the unified CLI test runner or npm:

```powershell
# 1. Run full test suite across all 4 Tiers (Default: Headless Chrome)
node tests/test_runner.js

# 2. Alternative npm test command
npm test

# 3. Run individual tiers
node tests/test_runner.js --tier=1    # Feature Coverage (Happy-Path)
node tests/test_runner.js --tier=2    # Boundary, Edge & Corner Cases
node tests/test_runner.js --tier=3    # Pairwise Cross-Feature Interactions
node tests/test_runner.js --tier=4    # Real-World Runner Scenarios

# 4. Run with Microsoft Edge channel
node tests/test_runner.js --browser=edge

# 5. List all discovered test cases without execution
node tests/test_runner.js --list
```

---

## 3. Tier Breakdown Table

| Tier | Name | Test Count | Test File | Primary Focus |
|:---|:---|:---:|:---|:---|
| **Tier 1** | Feature Coverage | **14** | `tests/e2e/tier1_feature_coverage.spec.js` | Happy-path verification for all discrete features (Map, Route, Garmin Sync, Comparison, History). |
| **Tier 2** | Boundary & Corner | **9** | `tests/e2e/tier2_boundary_corner.spec.js` | Limits, extreme coordinates, OSRM 500 error & Haversine fallback, corrupt GPX/JSON, 0 GPS points, extreme detours. |
| **Tier 3** | Cross-Feature Pairwise | **5** | `tests/e2e/tier3_cross_feature.spec.js` | Interaction testing: Route + OAuth Sync, Provider Toggle state memory, GPX Import + Reload, Multi-record deletion. |
| **Tier 4** | Real-World Scenarios | **3** | `tests/e2e/tier4_real_world.spec.js` | Complete 5K runner workflow, network outage resilience & local GPX upload, mobile viewport responsiveness. |
| **TOTAL** | **All Tiers 1–4** | **31** | **4 Spec Files** | **Complete Opaque-Box System Verification** |

---

## 4. Feature Coverage Checklist (32 Inventoried Features)

| Feature # | Feature Description | Milestone | Covered By Test | Status |
|:---:|:---|:---:|:---|:---:|
| 1 | Responsive Map Container | M1 | `T1.01`, `T4.03` | ✅ Ready |
| 2 | Leaflet Default Provider (CartoDB/OSM) | M1 | `T1.01` | ✅ Ready |
| 3 | Google Maps Dynamic Loader | M1 | `T1.02` | ✅ Ready |
| 4 | Automatic Fallback Mechanism | M1 | `T1.02` | ✅ Ready |
| 5 | Manual Provider Toggle | M1 | `T1.03`, `T3.02` | ✅ Ready |
| 6 | Point A Selection (Start) | M1 | `T1.04` | ✅ Ready |
| 7 | Point B Selection (Finish) | M1 | `T1.04` | ✅ Ready |
| 8 | Draggable Waypoints | M1 | `T1.05` | ✅ Ready |
| 9 | Point Swap & Reset | M1 | `T1.06` | ✅ Ready |
| 10 | OSRM Running Route Calculation | M1 | `T1.07` | ✅ Ready |
| 11 | Resilient Routing Fallback (Haversine 1.25) | M1 | `T2.03`, `T4.02` | ✅ Ready |
| 12 | Planned Route Tracing (Blue `#3B82F6`) | M1 | `T1.07`, `T3.01` | ✅ Ready |
| 13 | Distance Calculation in km | M1 | `T1.07` | ✅ Ready |
| 14 | Mock OAuth 2.0 PKCE Flow | M2 | `T1.08`, `T4.01` | ✅ Ready |
| 15 | Garmin Sync REST API (`/api/garmin/activities`) | M2 | `T1.09` | ✅ Ready |
| 16 | Pre-seeded Workout Library (5K, 10K) | M2 | `T1.09` | ✅ Ready |
| 17 | GPX 1.1 File Import | M2 | `T1.10`, `T3.03` | ✅ Ready |
| 18 | Garmin JSON Import | M2 | `T1.10`, `T2.06` | ✅ Ready |
| 19 | Telemetry Extraction (Time, Pace, Distance, GPS) | M2 | `T1.10` | ✅ Ready |
| 20 | Dual Polyline Overlay (Orange over Blue) | M3 | `T1.11`, `T3.01` | ✅ Ready |
| 21 | Automated Viewport Framing (`fitBounds`) | M3 | `T1.11` | ✅ Ready |
| 22 | Distance Comparison Metric ($\Delta D$ and %) | M3 | `T1.12`, `T3.04` | ✅ Ready |
| 23 | Pace & Time Analysis | M3 | `T1.12` | ✅ Ready |
| 24 | Corridor Adherence Scoring (25m XTE threshold) | M3 | `T1.12`, `T2.08` | ✅ Ready |
| 25 | Out-of-Corridor Highlighting (Detour warning) | M3 | `T2.08`, `T3.04` | ✅ Ready |
| 26 | Workout Record Assembler | M3 | `T1.13` | ✅ Ready |
| 27 | Atomic File Persistence (`data/workouts.json`) | M3 | `T1.13`, `T3.03` | ✅ Ready |
| 28 | LocalStorage Redundancy Cache | M3 | `T1.13`, `T3.03` | ✅ Ready |
| 29 | Minimalist History Dashboard | M3 | `T1.14`, `T2.09` | ✅ Ready |
| 30 | Mini Route Preview Thumbnail | M3 | `T1.14` | ✅ Ready |
| 31 | Historical Workout Re-Inspection | M3 | `T1.14`, `T4.01` | ✅ Ready |
| 32 | Workout Deletion / Clear | M3 | `T1.14`, `T3.05` | ✅ Ready |

---

## 5. Passing Criteria & Acceptance Gates

1. **Syntax & Compilation**: All 4 spec files and helper utilities must parse cleanly without syntax errors (verified: `exit code 0`).
2. **Milestone 1–3 Progression**: Implementing agents can execute their respective tier subsets during development:
   - Milestone 1: `node tests/test_runner.js --tier=1 --grep="T1.0[1-7]"`
   - Milestone 2: `node tests/test_runner.js --tier=1 --grep="T1.0[8-9]|T1.10"`
   - Milestone 3: `node tests/test_runner.js --tier=1 --grep="T1.1[1-4]"` and `node tests/test_runner.js --tier=3`
3. **Milestone 4 Gate (100% Pass)**: The implementation track must achieve **31 passed / 0 failed** across Tiers 1–4 before entering Milestone 5 Adversarial Hardening.
