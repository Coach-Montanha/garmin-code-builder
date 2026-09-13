/**
 * Tier 5: Adversarial Stress & Concurrency Verification Spec
 * Headless browser automation testing the UI, Map State Machine, and Provider Transitions.
 */

import { test, expect } from '@playwright/test';
import { setupStandardMocks } from './helpers.js';

test.describe('Tier 5: Adversarial Stress & State Machine Verification', () => {

  // T5.01: Rapid 20 Map Clicks in 2 seconds
  test('T5.01 - Rapid successive map clicks do not corrupt A/B point state machine', async ({ page }) => {
    await setupStandardMocks(page);
    await page.goto('/');
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    expect(mapBox).not.toBeNull();

    const startX = mapBox.x + 450;
    const startY = mapBox.y + 200;

    // 20 rapid clicks within ~2 seconds
    for (let i = 0; i < 20; i++) {
      await page.mouse.click(startX + (i % 5) * 35, startY + Math.floor(i / 5) * 35);
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(500);

    const state = await page.evaluate(() => {
      const app = window.garminApp;
      return {
        markersCount: app.mapManager.markersState.size,
        domMarkers: document.querySelectorAll('.custom-leaflet-marker').length,
        polylinesCount: app.mapManager.polylinesState.size,
        pointA: app.routePlanner.pointA?.position,
        pointB: app.routePlanner.pointB?.position,
      };
    });

    expect(state.markersCount).toBe(2);
    expect(state.domMarkers).toBe(2);
    expect(state.pointA).not.toBeNull();
    expect(state.pointB).not.toBeNull();
    expect(state.polylinesCount).toBe(1);
  });

  // T5.02: Rapid Point Swapping parity check
  test('T5.02 - Rapid point swapping preserves coordinate parity and marker state', async ({ page }) => {
    await setupStandardMocks(page);
    await page.goto('/');
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 450, mapBox.y + 200);
    await page.waitForTimeout(150);
    await page.mouse.click(mapBox.x + 600, mapBox.y + 300);
    await page.waitForTimeout(400);

    const posInitial = await page.evaluate(() => ({
      start: { ...window.garminApp.routePlanner.pointA.position },
      finish: { ...window.garminApp.routePlanner.pointB.position },
    }));

    const swapBtn = page.locator('#swap-points-btn');
    for (let i = 0; i < 25; i++) {
      await swapBtn.click({ force: true });
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(400);

    const posFinal = await page.evaluate(() => ({
      start: { ...window.garminApp.routePlanner.pointA.position },
      finish: { ...window.garminApp.routePlanner.pointB.position },
      markersCount: window.garminApp.mapManager.markersState.size,
    }));

    // Odd number of swaps -> positions inverted
    expect(Math.abs(posFinal.start.lat - posInitial.finish.lat)).toBeLessThan(0.0001);
    expect(Math.abs(posFinal.finish.lat - posInitial.start.lat)).toBeLessThan(0.0001);
    expect(posFinal.markersCount).toBe(2);
  });

  // T5.03: In-Flight Route vs Reset Race Condition check
  test('T5.03 - [ADVERSARIAL] In-flight route request vs immediate reset race vulnerability', async ({ page }) => {
    await page.route(/photon\.komoot\.io\/api/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: [] }) });
    });
    await page.route(/router\.project-osrm\.org\/route\/v1\/foot/, async (route) => {
      await new Promise(r => setTimeout(r, 400));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'Ok',
          routes: [{ distance: 4000.0, duration: 1200.0, geometry: { type: 'LineString', coordinates: [[-46.65, -23.58], [-46.66, -23.59]] } }],
        }),
      });
    });

    await page.goto('/');
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 450, mapBox.y + 200);
    await page.waitForTimeout(100);
    await page.mouse.click(mapBox.x + 600, mapBox.y + 300);

    // Click Reset while route is in flight
    await page.waitForTimeout(50);
    await page.locator('#reset-route-btn').click({ force: true });

    // Wait for delayed response
    await page.waitForTimeout(600);

    const raceState = await page.evaluate(() => {
      const app = window.garminApp;
      const hud = document.getElementById('route-hud');
      return {
        polylinesCount: app.mapManager.polylinesState.size,
        hudHidden: hud.classList.contains('hidden'),
      };
    });

    // Documents whether race condition vulnerability is active
    const isVulnerable = raceState.polylinesCount > 0 || !raceState.hudHidden;
    console.log(`[T5.03 Verification] Race condition vulnerability active: ${isVulnerable}`);
  });

  // T5.04: Leaflet popup pane blocking marker interaction check
  test('T5.04 - [ADVERSARIAL] CSS pointer events interception on leaflet markers', async ({ page }) => {
    await setupStandardMocks(page);
    await page.goto('/');
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 500, mapBox.y + 250);
    await page.waitForTimeout(200);

    const hitResult = await page.evaluate(() => {
      const markerEl = document.querySelector('.custom-leaflet-marker');
      if (!markerEl) return { error: 'not found' };
      const rect = markerEl.getBoundingClientRect();
      const hitEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        hitTag: hitEl ? hitEl.tagName : null,
        hitClass: hitEl ? hitEl.className : null,
        isBlocked: hitEl && hitEl.classList.contains('leaflet-popup-pane'),
      };
    });

    console.log(`[T5.04 Verification] Leaflet popup-pane intercepts marker clicks: ${hitResult.isBlocked}`);
  });

  // T5.05: Provider toggling under active route display (zero data loss)
  test('T5.05 - Provider toggling preserves markers and route polylines', async ({ page }) => {
    // Inject mock Google Maps API
    await page.addInitScript(() => {
      window.google = {
        maps: {
          Map: class {
            constructor(c, opts) { this.c = c; this.opts = opts; }
            setCenter() {} getCenter() { return { lat: () => 0, lng: () => 0 }; }
            setZoom() {} getZoom() { return 14; }
            addListener() { return { remove: () => {} }; }
            fitBounds() {}
          },
          Marker: class {
            constructor(opts) { this.opts = opts; }
            setPosition() {} setMap() {}
            addListener() { return { remove: () => {} }; }
          },
          Polyline: class {
            constructor(opts) { this.opts = opts; }
            setMap() {} setPath() {}
          },
          LatLngBounds: class { extend() {} },
          Size: class {}, Point: class {},
          ControlPosition: { RIGHT_BOTTOM: 9 },
          event: { clearInstanceListeners() {} },
        },
      };
    });

    await setupStandardMocks(page);
    await page.goto('/');
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 500, mapBox.y + 250);
    await page.waitForTimeout(200);
    await page.mouse.click(mapBox.x + 650, mapBox.y + 350);
    await page.waitForTimeout(400);

    const initialLeaflet = await page.evaluate(() => {
      const mm = window.garminApp.mapManager;
      return {
        markers: mm.markersState.size,
        polylines: mm.polylinesState.size,
        polyPoints: mm.polylinesState.get('planned-route')?.points.length,
      };
    });

    // Switch to Google Maps
    await page.evaluate(async () => {
      await window.garminApp.mapManager.switchProvider('google', 'AIzaSyMockKey');
    });
    await page.waitForTimeout(200);

    // Switch back to Leaflet
    await page.evaluate(async () => {
      await window.garminApp.mapManager.switchProvider('leaflet');
    });
    await page.waitForTimeout(200);

    const restoredLeaflet = await page.evaluate(() => {
      const mm = window.garminApp.mapManager;
      return {
        markers: mm.markersState.size,
        polylines: mm.polylinesState.size,
        polyPoints: mm.polylinesState.get('planned-route')?.points.length,
        activeProvider: mm.getProviderName(),
      };
    });

    expect(restoredLeaflet.activeProvider).toBe('leaflet');
    expect(restoredLeaflet.markers).toBe(initialLeaflet.markers);
    expect(restoredLeaflet.polylines).toBe(initialLeaflet.polylines);
    expect(restoredLeaflet.polyPoints).toBe(initialLeaflet.polyPoints);
  });

  // T5.06: Simulated network drop during routing
  test('T5.06 - Hard network drop triggers resilient Haversine 1.25x fallback polyline and HUD', async ({ page }) => {
    let aborted = false;
    await page.route(/router\.project-osrm\.org\/route\/v1\/foot/, async (route) => {
      aborted = true;
      await route.abort('connectionfailed');
    });

    await page.goto('/');
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 500, mapBox.y + 250);
    await page.waitForTimeout(200);
    await page.mouse.click(mapBox.x + 650, mapBox.y + 350);
    await page.waitForTimeout(600);

    const fallback = await page.evaluate(() => {
      const app = window.garminApp;
      const hud = document.getElementById('route-hud');
      const dist = document.getElementById('hud-distance')?.innerText;
      const badge = document.getElementById('hud-source-badge')?.innerText;
      const poly = app.mapManager.polylinesState.get('planned-route');
      return {
        hudVisible: !hud.classList.contains('hidden'),
        dist,
        badge,
        points: poly ? poly.points.length : 0,
      };
    });

    expect(aborted).toBe(true);
    expect(fallback.hudVisible).toBe(true);
    expect(parseFloat(fallback.dist)).toBeGreaterThan(0);
    expect(fallback.points).toBeGreaterThanOrEqual(15);
    expect(fallback.badge.toLowerCase()).toContain('offline');
  });

});
