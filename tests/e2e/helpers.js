/**
 * Garmin Running Tracker - E2E Testing Helpers & Contract Locators
 * Opaque-box testing utilities independent of internal implementation.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const FIXTURE_DIR = path.resolve(__dirname, '../fixtures');

/**
 * Common DOM Selectors with resilient fallback cascades.
 */
export const SELECTORS = {
  map: '#map, #map-container, [data-testid="map-container"], .leaflet-container',
  leafletTiles: '.leaflet-tile-pane, .leaflet-tile, img[src*="tile"]',
  leafletMarkers: '.leaflet-marker-icon, [data-testid="marker"]',
  googleMap: '.gm-style, [data-testid="google-map"]',
  providerToggle: '#provider-toggle, #map-provider-select, [data-testid="provider-toggle"], select[name="provider"]',

  // Route Planning
  startInput: '#start-input, input[name="start"], [data-testid="start-input"], input[placeholder*="Start" i], input[placeholder*="Início" i]',
  finishInput: '#finish-input, input[name="finish"], [data-testid="finish-input"], input[placeholder*="Finish" i], input[placeholder*="Chegada" i]',
  swapPointsBtn: '#swap-points-btn, [data-testid="swap-points"], button:has-text("Swap")',
  resetRouteBtn: '#reset-route-btn, #clear-route-btn, [data-testid="reset-route"], button:has-text("Reset"), button:has-text("Clear")',
  calculateBtn: '#calculate-route-btn, [data-testid="calculate-route"], button:has-text("Calculate"), button:has-text("Calcular")',
  plannedDistance: '#planned-distance, [data-testid="planned-distance"], .planned-distance, [data-metric="planned-distance"]',

  // Garmin Sync & File Import
  connectGarminBtn: '#connect-garmin-btn, [data-testid="connect-garmin"], button:has-text("Connect Garmin"), button:has-text("Garmin Connect")',
  garminModal: '#garmin-modal, dialog#garmin-modal, [data-testid="garmin-modal"], .garmin-modal',
  authorizeBtn: '#authorize-btn, [data-testid="authorize-btn"], button:has-text("Authorize"), button:has-text("Autorizar")',
  disconnectGarminBtn: '#disconnect-garmin-btn, [data-testid="disconnect-garmin"], button:has-text("Disconnect")',
  garminStatus: '#garmin-status, [data-testid="garmin-status"], .garmin-status-badge',
  syncActivitiesBtn: '#sync-activities-btn, [data-testid="sync-activities"], button:has-text("Sync"), button:has-text("Sincronizar")',
  activityItem: '.activity-item, [data-testid="activity-item"]',
  gpxFileInput: 'input[type="file"], #gpx-file-input, [data-testid="gpx-file-input"]',

  // Comparison & Analytics HUD
  comparisonHud: '#comparison-hud, [data-testid="comparison-hud"], .comparison-panel',
  plannedPolyline: 'path[stroke*="#3B82F6" i], path[stroke*="#2563EB" i], [data-testid="planned-polyline"]',
  actualPolyline: 'path[stroke*="#FF6600" i], path[stroke*="#EA580C" i], [data-testid="actual-polyline"]',
  distanceDelta: '#distance-delta, [data-testid="distance-delta"], .distance-delta',
  comparisonBar: '#comparison-bar, [data-testid="comparison-bar"], progress.comparison-bar',
  actualPace: '#actual-pace, [data-testid="actual-pace"], .actual-pace',
  actualTime: '#actual-time, [data-testid="actual-time"], .actual-time',
  adherenceScore: '#adherence-score, #compliance-score, [data-testid="adherence-score"], .adherence-badge',
  detourHighlight: '#detour-highlight, .detour-segment, path[stroke*="#DC2626" i], [data-testid="detour-polyline"]',

  // Persistence & History Dashboard
  saveWorkoutBtn: '#save-workout-btn, [data-testid="save-workout"], button:has-text("Save"), button:has-text("Salvar")',
  historyContainer: '#history-list, #workout-history, [data-testid="history-list"], .history-container',
  workoutCard: '.workout-card, [data-testid="workout-card"]',
  miniRoutePreview: '.mini-route-preview, svg.mini-route, canvas.mini-route, [data-testid="mini-route"]',
  deleteWorkoutBtn: '.delete-workout-btn, [data-testid="delete-workout"], button:has-text("Delete"), button:has-text("Excluir")',
  clearHistoryBtn: '#clear-history-btn, [data-testid="clear-history"], button:has-text("Clear History")',
};

/**
 * Mathematical Haversine Distance between two points in meters.
 */
export function haversineDistanceMeters(p1, p2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates cumulative distance in kilometers along a coordinate path.
 */
export function calculatePathDistanceKm(coords) {
  if (!coords || coords.length < 2) return 0;
  let totalMeters = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    totalMeters += haversineDistanceMeters(coords[i], coords[i + 1]);
  }
  return parseFloat((totalMeters / 1000).toFixed(2));
}

/**
 * Convert speed in m/s to pace string "m:ss /km".
 */
export function speedToPaceString(mps) {
  if (!mps || mps <= 0) return '0:00 /km';
  const secPerKm = Math.round(1000 / mps);
  const min = Math.floor(secPerKm / 60);
  const sec = secPerKm % 60;
  return `${min}:${sec < 10 ? '0' : ''}${sec} /km`;
}

/**
 * Setup simulated network routes for isolated predictable execution.
 */
export async function setupStandardMocks(page, options = {}) {
  // Mock Photon / Nominatim address search
  await page.route(/photon\.komoot\.io\/api|nominatim\.openstreetmap\.org\/search/, async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get('q') || '';
    if (query.toLowerCase().includes('empty') || query.toLowerCase().includes('notfound')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: [] }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        features: [
          {
            properties: { name: query, country: 'Brazil', city: 'São Paulo' },
            geometry: { coordinates: [-46.6576, -23.5874] },
          },
        ],
      }),
    });
  });

  // Mock OSRM Foot Routing API
  if (options.failRouting) {
    await page.route(/router\.project-osrm\.org\/route\/v1\/foot/, async (route) => {
      await route.abort('failed');
    });
  } else {
    await page.route(/router\.project-osrm\.org\/route\/v1\/foot/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'Ok',
          routes: [
            {
              distance: 5120.0,
              duration: 1536.0,
              geometry: {
                type: 'LineString',
                coordinates: [
                  [-46.6576, -23.5874],
                  [-46.6580, -23.5860],
                  [-46.6588, -23.5845],
                  [-46.6595, -23.5830],
                  [-46.6601, -23.5818],
                ],
              },
            },
          ],
        }),
      });
    });
  }

  // Mock Garmin Connect OAuth & Activities endpoints
  await page.route(/\/api\/garmin\/oauth\/authorize/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authUrl: '/api/garmin/oauth/callback?code=MOCK_GARMIN_CODE_123&state=abc',
        clientId: 'garmin_running_app',
      }),
    });
  });

  await page.route(/\/api\/garmin\/oauth\/token/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock_garmin_access_token_999',
        token_type: 'Bearer',
        expires_in: 86400,
        user: { name: 'TestRunner_Pro' },
      }),
    });
  });

  await page.route(/\/api\/garmin\/activities(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'garmin_act_5k',
          name: 'Morning 5K Road Run',
          startTime: '2026-09-12T09:45:00Z',
          totalDistanceKm: 5.12,
          elapsedTimeSec: 1560,
          movingDurationSec: 1530,
          averagePaceMinPerKm: '4:59',
          trackPoints: [
            { lat: -23.5874, lng: -46.6576, ele: 760 },
            { lat: -23.5860, lng: -46.6580, ele: 761 },
            { lat: -23.5845, lng: -46.6588, ele: 762 },
            { lat: -23.5830, lng: -46.6595, ele: 761 },
            { lat: -23.5818, lng: -46.6601, ele: 760 },
          ],
        },
        {
          id: 'garmin_act_10k',
          name: 'Weekend 10K Tempo',
          startTime: '2026-09-10T08:00:00Z',
          totalDistanceKm: 10.05,
          elapsedTimeSec: 3015,
          averagePaceMinPerKm: '5:00',
          trackPoints: [
            { lat: -23.5874, lng: -46.6576 },
            { lat: -23.5700, lng: -46.6400 },
          ],
        },
      ]),
    });
  });
}
