# Project: Garmin Running Tracker

## Architecture
A lightweight, zero-bloat web application for road running featuring:
- **Frontend Architecture**: Vanilla HTML5 + modern CSS3 + ES Modules (`<script type="module">`). Zero build tools or bundler overhead.
- **Backend Architecture**: Node.js 20 LTS with Express REST API.
- **Map Provider Layer (`IMapAdapter`)**: Decoupled interface supporting Leaflet (v1.9.4) with CartoDB Positron & OpenStreetMap tiles as default zero-setup provider (0ms latency, no API key required). Dynamic loader for Google Maps JavaScript API with automatic silent fallback to Leaflet on missing key, timeout, or auth error (`window.gm_authFailure`).
- **Route Planning Engine**: Interactive Point A (Start) and Point B (Finish) selection via address search (Komoot Photon geocoding) or direct map click. Running route calculation using OSRM Foot Routing API (`https://router.project-osrm.org/route/v1/foot/`) with offline fallback via Haversine interpolation scaled by an urban circuity factor of 1.25.
- **Garmin Connect Integration Layer**: Simulated OAuth 2.0 PKCE authentication flow (`/api/garmin/oauth/*`), mock REST API endpoints (`/api/garmin/activities`, `/api/garmin/activities/:id`), pre-seeded realistic running activities (5K, 10K, half-marathon), and client-side file upload support for standard GPX 1.1 XML and Garmin Activity JSON files.
- **Route Comparison & Analytics Engine**: Dual-polyline visual comparison with optical hierarchy (6px Sapphire Blue `#3B82F6` planned corridor vs 3.5px Sunset Orange `#FF6600` Garmin GPS track overlay). Calculation of absolute and percentage distance delta ($\Delta D$), pace variance (min/km), moving time difference, perpendicular Cross-Track Error (XTE), and 25-meter corridor compliance score (% of actual GPS points within planned corridor).
- **Persistence & Dashboard**: Crash-safe pure-JS atomic write-and-rename JSON store (`data/workouts.json`) paired with client-side LocalStorage cache. Responsive, minimalist dashboard showing workout history, metric badges, and interactive mini polyline route previews.

---

## Feature Inventory
Every feature identified during the Survey phase mapped to its designated milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Responsive Map Container | Fullscreen responsive map container with touch & mouse controls | M1 | Survey (FR-01) |
| 2 | Leaflet Default Provider | Keyless Leaflet 1.9.4 integration with CartoDB / OSM tiles | M1 | Survey (FR-02) |
| 3 | Google Maps Dynamic Loader | Dynamic loader for Google Maps JavaScript API v3 | M1 | Survey (FR-03) |
| 4 | Automatic Fallback Mechanism | Graceful downgrade to Leaflet on missing key, network error, or gm_authFailure | M1 | Survey (FR-04) |
| 5 | Manual Provider Toggle | UI toggle allowing runner to switch between Leaflet and Google Maps | M1 | Survey (FR-05) |
| 6 | Point A Selection (Start) | Address autocomplete via Photon + map click placement with emerald marker | M1 | Survey (FR-06) |
| 7 | Point B Selection (Finish) | Address autocomplete via Photon + map click placement with crimson marker | M1 | Survey (FR-07) |
| 8 | Draggable Waypoints | Drag and drop markers for Start and Finish with reverse geocoding | M1 | Survey (FR-08) |
| 9 | Point Swap & Reset | Swap Start/Finish points and one-click route reset | M1 | Survey (FR-09) |
| 10 | OSRM Running Route Calculation | Real-world pedestrian road routing via OSRM Foot API with GeoJSON geometry | M1 | Survey (FR-10) |
| 11 | Resilient Routing Fallback | Haversine + 1.25 urban circuity fallback when network or routing API is unavailable | M1 | Survey (FR-11) |
| 12 | Planned Route Tracing | Smooth blue polyline rendering (`#3B82F6`, 6px) on active map provider | M1 | Survey (FR-12) |
| 13 | Distance Calculation | Accurate calculation and display of planned distance in kilometers (e.g. 5.24 km) | M1 | Survey (FR-13) |
| 14 | Mock OAuth 2.0 PKCE Flow | Connect Garmin modal, simulated authorization code & access token generation | M2 | Survey (FR-14) |
| 15 | Garmin Sync REST API | Simulated `/api/garmin/activities` returning realistic runner activities | M2 | Survey (FR-15) |
| 16 | Pre-seeded Workout Library | Built-in realistic 5K, 10K, and Half Marathon running workouts with GPS tracks | M2 | Survey (FR-16) |
| 17 | GPX 1.1 File Import | Client-side XML parser extracting lat/lon/ele/time and TrackPointExtensions | M2 | Survey (FR-17) |
| 18 | Garmin JSON Import | Parser for exported Garmin Connect activity JSON format | M2 | Survey (FR-18) |
| 19 | Telemetry Extraction | Extraction of elapsed time, moving time, distance (km), average pace (min/km), and GPS array | M2 | Survey (FR-19) |
| 20 | Dual Polyline Overlay | Garmin GPS track (`#FF6600`, 3.5px) overlaid directly onto planned route (`#3B82F6`) | M3 | Survey (FR-20) |
| 21 | Automated Viewport Framing | Dynamic `fitBounds` with padding to frame both planned and actual tracks | M3 | Survey (FR-21) |
| 22 | Distance Comparison Metric | Numerical and visual comparative bar for planned vs actual distance ($\Delta D$) | M3 | Survey (FR-22) |
| 23 | Pace & Time Analysis | Formatting and comparison of average pace (min/km) and workout duration | M3 | Survey (FR-23) |
| 24 | Corridor Adherence Scoring | Mathematical Cross-Track Error calculation with 25m/30m threshold and compliance % | M3 | Survey (FR-24) |
| 25 | Out-of-Corridor Highlighting | Visual detour indication or warning when GPS points deviate beyond corridor | M3 | Survey (FR-25) |
| 26 | Workout Record Assembler | Composite record builder binding planned route, Garmin telemetry, and metrics | M3 | Survey (FR-26) |
| 27 | Atomic File Persistence | Safe atomic write-and-rename backend storage in `data/workouts.json` | M3 | Survey (FR-27) |
| 28 | LocalStorage Redundancy | Client-side LocalStorage cache with defensive quota management | M3 | Survey (FR-28) |
| 29 | Minimalist History Dashboard | Clean workout history cards with date, time, distance, pace, and compliance score | M3 | Survey (FR-29) |
| 30 | Mini Route Preview | Compact SVG / mini-canvas rendering of compared routes on history cards | M3 | Survey (FR-30) |
| 31 | Historical Workout Re-Inspection | Click workout card to reload route, overlay, and analytics into main map view | M3 | Survey (FR-31) |
| 32 | Workout Deletion / Clear | Ability to delete individual workout records or clear history | M3 | Survey (FR-32) |
| 33 | E2E Testing Suite (Tiers 1-4) | Opaque-box automated test suite verifying map, routing, sync, comparison, and history | M4 | Survey (FR-33) |
| 34 | Adversarial Hardening (Tier 5) | White-box stress testing, corrupt payload handling, network failure resilience | M5 | Survey (FR-34) |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Map Interface & Route Planning Engine | Leaflet/OSM default + Google Maps fallback, address search & map click point selection (A/B), OSRM routing + Haversine fallback, distance in km | none | PLANNED |
| M2 | Garmin Connect Sync & Activity Reader | Mock OAuth 2.0 PKCE flow, Garmin REST API mock, pre-seeded activities, GPX 1.1 / Garmin JSON parser, telemetry extraction (time, pace, dist, GPS) | none | PLANNED |
| M3 | Route Comparison & Dashboard History | Dual polyline overlay, comparative metrics ($\Delta D$, pace, corridor compliance), atomic JSON persistence, minimalist history cards with mini-route previews | M1, M2 | PLANNED |
| M4 | Final Milestone Phase 1: 100% E2E Test Pass | Pass all Tiers 1-4 opaque-box tests created by the E2E Testing Track | M3, TEST_READY | PLANNED |
| M5 | Final Milestone Phase 2: Adversarial Coverage Hardening | Tier 5 white-box stress testing, adversarial edge cases, gap elimination | M4 | PLANNED |

---

## Interface Contracts

### 1. Unified Map Adapter (`IMapAdapter`)
```typescript
interface LatLng {
  lat: number;
  lng: number;
}

interface MarkerOptions {
  label?: string;
  draggable?: boolean;
  color?: string;
  icon?: string;
}

interface PolylineOptions {
  color: string;
  weight: number;
  opacity: number;
  dashArray?: string;
  zIndex?: number;
}

interface IMapAdapter {
  init(containerId: string, initialCenter: LatLng, zoom: number): Promise<void>;
  setCenter(center: LatLng, zoom?: number): void;
  addMarker(id: string, position: LatLng, options?: MarkerOptions): void;
  removeMarker(id: string): void;
  updateMarkerPosition(id: string, position: LatLng): void;
  renderPolyline(id: string, points: LatLng[], options: PolylineOptions): void;
  removePolyline(id: string): void;
  fitBounds(points: LatLng[], padding?: [number, number]): void;
  onMapClick(handler: (coord: LatLng) => void): void;
  onMarkerDrag(id: string, handler: (newPos: LatLng) => void): void;
  destroy(): void;
  getProviderName(): 'leaflet' | 'google';
}
```

### 2. Route Planning & Routing Service (`IRoutingService`)
```typescript
interface RouteResult {
  points: LatLng[];
  distanceKm: number;
  estimatedDurationSec: number;
  source: 'osrm' | 'fallback';
}

interface IRoutingService {
  calculateRoute(start: LatLng, finish: LatLng): Promise<RouteResult>;
  searchAddress(query: string): Promise<Array<{ label: string; position: LatLng }>>;
  reverseGeocode(position: LatLng): Promise<string>;
}
```

### 3. Garmin Sync & Activity Service (`IGarminService`)
```typescript
interface GarminActivity {
  id: string;
  name: string;
  startTime: string; // ISO 8601
  totalDistanceKm: number;
  elapsedTimeSec: number;
  averagePaceMinPerKm: string; // e.g. "5:12"
  trackPoints: Array<{ lat: number; lng: number; time?: string; elevation?: number }>;
}

interface IGarminService {
  connectOAuth(): Promise<{ connected: boolean; token: string }>;
  disconnect(): Promise<void>;
  fetchActivities(): Promise<GarminActivity[]>;
  getActivity(id: string): Promise<GarminActivity>;
  parseGPX(xmlText: string): Promise<GarminActivity>;
  parseGarminJSON(jsonText: string): Promise<GarminActivity>;
}
```

### 4. Comparison & Analytics Service (`IComparisonService`)
```typescript
interface ComparisonResult {
  plannedDistanceKm: number;
  actualDistanceKm: number;
  distanceDeltaKm: number; // actual - planned
  distanceDeltaPercent: number; // ((actual - planned) / planned) * 100
  actualPace: string; // "min/km"
  actualDuration: string; // "hh:mm:ss"
  corridorCompliancePercent: number; // % of GPS points within 25m/30m of planned line
  deviationCount: number;
}

interface IComparisonService {
  compareRoutes(plannedRoute: LatLng[], actualTrack: LatLng[]): ComparisonResult;
}
```

### 5. Workout Storage Service (`IWorkoutStorage`)
```typescript
interface WorkoutRecord {
  id: string;
  createdAt: string;
  title: string;
  plannedRoute: {
    start: { label: string; position: LatLng };
    finish: { label: string; position: LatLng };
    points: LatLng[];
    distanceKm: number;
  };
  garminActivity: GarminActivity;
  comparison: ComparisonResult;
}

interface IWorkoutStorage {
  saveWorkout(workout: Omit<WorkoutRecord, 'id' | 'createdAt'>): Promise<WorkoutRecord>;
  getAllWorkouts(): Promise<WorkoutRecord[]>;
  getWorkout(id: string): Promise<WorkoutRecord | null>;
  deleteWorkout(id: string): Promise<boolean>;
}
```

---

## Code Layout
```
garmin_running_tracker/
├── package.json
├── server/
│   ├── app.js                 # Express server & API routes
│   ├── routes/
│   │   ├── garminRoutes.js    # Mock OAuth & Garmin activities API
│   │   └── workoutRoutes.js   # Workouts persistence API
│   └── storage/
│       └── jsonStore.js       # Atomic file write & read store (data/workouts.json)
├── data/
│   ├── workouts.json          # Persistent workouts JSON file
│   └── fixtures/              # Pre-seeded 5K, 10K, Half-Marathon GPX/JSON
├── public/
│   ├── index.html             # Single-page minimalist runner UI
│   ├── css/
│   │   ├── style.css          # Minimalist responsive styles
│   │   └── leaflet.css        # Vendored Leaflet CSS
│   └── js/
│       ├── app.js             # Main application orchestrator & UI bindings
│       ├── map/
│       │   ├── mapAdapter.js  # IMapAdapter interface & provider router
│       │   ├── leafletAdapter.js # Leaflet implementation
│       │   └── googleAdapter.js  # Google Maps implementation + fallback
│       ├── services/
│       │   ├── routingService.js # Photon geocoding + OSRM routing + fallback
│       │   ├── garminService.js  # OAuth mock, REST client, GPX/JSON parsers
│       │   ├── comparisonService.js # Haversine, Cross-Track Error, metrics
│       │   └── storageService.js # API client + LocalStorage redundancy
│       ├── vendor/
│       │   └── leaflet.js     # Vendored Leaflet 1.9.4
│       └── components/
│           ├── routePlanner.js # Start/Finish address & click handling
│           ├── syncModal.js    # Garmin OAuth connect & activity selector
│           ├── historyPanel.js # Workout history cards & mini route renderers
│           └── statsOverlay.js # HUD comparison badges & delta indicators
└── tests/
    ├── e2e/                   # Playwright opaque-box E2E test suites
    │   ├── tier1_feature_coverage.spec.js
    │   ├── tier2_boundary_corner.spec.js
    │   ├── tier3_cross_feature.spec.js
    │   └── tier4_real_world.spec.js
    ├── unit/                  # Node.js native test runner suites
    │   ├── comparison.test.js
    │   ├── gpx_parser.test.js
    │   └── routing_fallback.test.js
    └── test_runner.js         # Single unified test runner script
```
