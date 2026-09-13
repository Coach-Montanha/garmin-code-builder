/**
 * tests/stress_adversarial_suite.js
 * Consolidated Adversarial Stress Testing Suite for Garmin Running Tracker UI & Map State Machine.
 * Tests:
 *  1. Rapid successive map clicks (20 clicks in 2s) & A/B state machine stability
 *  2. Point swap & reset stress thrashing
 *  3. In-flight route vs reset race condition (empirical vulnerability check)
 *  4. Out-of-order route response overwrite on swap (empirical vulnerability check)
 *  5. Leaflet pane pointer-events interception defect (empirical vulnerability check)
 *  6. Provider toggling under active route (Leaflet <-> Google Maps with zero data loss)
 *  7. Simulated network drop while routing request is in flight (resilient 1.25x Haversine fallback)
 */

import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function injectMockGoogleMaps(page) {
  await page.addInitScript(() => {
    window.google = {
      maps: {
        Map: class {
          constructor(container, opts) {
            this.container = container;
            this.opts = opts;
            this.listeners = new Map();
            this.center = opts.center || { lat: 0, lng: 0 };
            this.zoom = opts.zoom || 14;
          }
          setCenter(c) { this.center = c; }
          getCenter() { return { lat: () => this.center.lat, lng: () => this.center.lng }; }
          setZoom(z) { this.zoom = z; }
          getZoom() { return this.zoom; }
          addListener(evt, cb) {
            if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
            this.listeners.get(evt).add(cb);
            return { remove: () => this.listeners.get(evt).delete(cb) };
          }
          fitBounds(b) {}
        },
        Marker: class {
          constructor(opts) {
            this.opts = opts;
            this.position = opts.position;
            this.listeners = new Map();
          }
          setPosition(p) { this.position = p; }
          setMap(m) { this.opts.map = m; }
          addListener(evt, cb) {
            if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
            this.listeners.get(evt).add(cb);
            return { remove: () => this.listeners.get(evt).delete(cb) };
          }
        },
        Polyline: class {
          constructor(opts) {
            this.opts = opts;
            this.path = opts.path;
          }
          setMap(m) { this.opts.map = m; }
          setPath(p) { this.path = p; }
        },
        LatLngBounds: class {
          constructor() { this.pts = []; }
          extend(pt) { this.pts.push(pt); }
        },
        Size: class { constructor(w, h) { this.width = w; this.height = h; } },
        Point: class { constructor(x, y) { this.x = x; this.y = y; } },
        ControlPosition: { RIGHT_BOTTOM: 9 },
        event: { clearInstanceListeners() {} }
      }
    };
  });
}

async function setupDefaultMocks(page) {
  await page.route(/photon\.komoot\.io\/api|nominatim\.openstreetmap\.org\/search/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        features: [{ properties: { name: 'Test Location', city: 'São Paulo' }, geometry: { coordinates: [-46.6576, -23.5874] } }]
      })
    });
  });

  await page.route(/photon\.komoot\.io\/reverse/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        features: [{ properties: { name: 'Rua das Corridas, 100', city: 'São Paulo' } }]
      })
    });
  });

  await page.route(/router\.project-osrm\.org\/route\/v1\/foot/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'Ok',
        routes: [{
          distance: 5120.0,
          duration: 1536.0,
          geometry: {
            type: 'LineString',
            coordinates: [
              [-46.6576, -23.5874],
              [-46.6580, -23.5860],
              [-46.6588, -23.5845],
              [-46.6595, -23.5830],
              [-46.6601, -23.5818]
            ]
          }
        }]
      })
    });
  });
}

export async function runSuite() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const results = [];

  function record(name, category, verdict, details = {}) {
    results.push({ name, category, verdict, details });
    const icon = verdict === 'PASS' ? '✅' : (verdict === 'VULNERABILITY' ? '🚨' : '⚠️');
    console.log(`[${icon} ${verdict}] ${name}`);
    console.log('       ', JSON.stringify(details));
  }

  console.log('================================================================');
  console.log('  GARMIN RUNNING TRACKER — ADVERSARIAL STRESS TEST SUITE');
  console.log('================================================================\n');

  // TEST 1: Rapid 20 Map Clicks in 2s
  {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(e.message));
    await setupDefaultMocks(page);
    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    const clickCount = 20;
    const startX = mapBox.x + 450;
    const startY = mapBox.y + 200;
    const t0 = Date.now();
    for (let i = 0; i < clickCount; i++) {
      await page.mouse.click(startX + (i % 5) * 40, startY + Math.floor(i / 5) * 40);
      await page.waitForTimeout(90);
    }
    const elapsed = Date.now() - t0;
    await page.waitForTimeout(400);

    const state = await page.evaluate(() => {
      const app = window.garminApp;
      return {
        markersCount: app.mapManager.markersState.size,
        domMarkerCount: document.querySelectorAll('.custom-leaflet-marker').length,
        polylinesCount: app.mapManager.polylinesState.size,
        pointA: app.routePlanner.pointA?.position,
        pointB: app.routePlanner.pointB?.position,
        hudDistance: document.getElementById('hud-distance')?.innerText
      };
    });

    const pass = state.markersCount === 2 && state.domMarkerCount === 2 && state.polylinesCount === 1 && consoleErrors.length === 0;
    record('T1: Rapid 20 Map Clicks (A/B State Machine Resilience)', 'State Machine', pass ? 'PASS' : 'FAIL', {
      clicksFired: clickCount,
      durationMs: elapsed,
      markersInState: state.markersCount,
      domMarkers: state.domMarkerCount,
      polylinesInState: state.polylinesCount,
      hudDistance: state.hudDistance,
      consoleErrors
    });
    await page.close();
  }

  // TEST 2: Point Swap Thrashing (25 Rapid Swaps)
  {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(e.message));
    await setupDefaultMocks(page);
    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 450, mapBox.y + 200);
    await page.waitForTimeout(150);
    await page.mouse.click(mapBox.x + 600, mapBox.y + 300);
    await page.waitForTimeout(400);

    const posInitial = await page.evaluate(() => ({
      start: { ...window.garminApp.routePlanner.pointA.position },
      finish: { ...window.garminApp.routePlanner.pointB.position }
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
      markersCount: window.garminApp.mapManager.markersState.size
    }));

    // 25 is odd, so start should match initial finish, and finish should match initial start
    const swapPass = Math.abs(posFinal.start.lat - posInitial.finish.lat) < 0.0001 &&
                     Math.abs(posFinal.finish.lat - posInitial.start.lat) < 0.0001 &&
                     posFinal.markersCount === 2 &&
                     consoleErrors.length === 0;

    record('T2: Point Swap Thrashing (25 Cycles at 30ms Interval)', 'Controls', swapPass ? 'PASS' : 'FAIL', {
      posInitial,
      posFinal,
      swappedCorrectly: swapPass
    });
    await page.close();
  }

  // TEST 3: In-Flight Route Request vs Immediate Reset Race Condition
  {
    const page = await browser.newPage();
    let routeFinished = false;
    await setupDefaultMocks(page);
    await page.route(/router\.project-osrm\.org\/route\/v1\/foot/, async (route) => {
      await new Promise(r => setTimeout(r, 400));
      routeFinished = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'Ok',
          routes: [{
            distance: 4800.0,
            duration: 1440.0,
            geometry: { type: 'LineString', coordinates: [[-46.65, -23.58], [-46.66, -23.59]] }
          }]
        })
      });
    });

    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 450, mapBox.y + 200);
    await page.waitForTimeout(100);
    await page.mouse.click(mapBox.x + 600, mapBox.y + 300); // triggers OSRM route request (400ms delay)

    // Wait 50ms (in flight), then click Reset
    await page.waitForTimeout(50);
    await page.locator('#reset-route-btn').click({ force: true });

    // Wait 600ms for delayed route to arrive
    await page.waitForTimeout(600);

    const raceState = await page.evaluate(() => {
      const app = window.garminApp;
      const hud = document.getElementById('route-hud');
      return {
        markersCount: app.mapManager.markersState.size,
        polylinesCount: app.mapManager.polylinesState.size,
        hudHidden: hud.classList.contains('hidden'),
        hudDistance: document.getElementById('hud-distance')?.innerText
      };
    });

    const isVulnerable = raceState.polylinesCount > 0 || !raceState.hudHidden;
    record(
      'T3: Race Condition: In-Flight Route vs Immediate Reset',
      'Concurrency',
      isVulnerable ? 'VULNERABILITY' : 'PASS',
      {
        bugConfirmed: isVulnerable,
        routeFinishedAfterReset: routeFinished,
        polylinesAfterReset: raceState.polylinesCount,
        hudHidden: raceState.hudHidden,
        hudDistance: raceState.hudDistance,
        finding: isVulnerable
          ? 'Late OSRM network response rendered ghost polyline and HUD after user reset!'
          : 'App cleanly aborted/ignored late route response.'
      }
    );
    await page.close();
  }

  // TEST 4: Out-of-Order Route Responses on Rapid Swap
  {
    const page = await browser.newPage();
    let reqCount = 0;
    await setupDefaultMocks(page);
    await page.route(/router\.project-osrm\.org\/route\/v1\/foot/, async (route) => {
      reqCount++;
      const reqId = reqCount;
      if (reqId === 1) {
        await new Promise(r => setTimeout(r, 500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'Ok',
            routes: [{
              distance: 3000.0, // 3.00 km (Stale route)
              duration: 900.0,
              geometry: { type: 'LineString', coordinates: [[-46.65, -23.58], [-46.66, -23.59]] }
            }]
          })
        });
      } else {
        await new Promise(r => setTimeout(r, 100));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'Ok',
            routes: [{
              distance: 7000.0, // 7.00 km (Newer route)
              duration: 2100.0,
              geometry: { type: 'LineString', coordinates: [[-46.66, -23.59], [-46.65, -23.58]] }
            }]
          })
        });
      }
    });

    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 450, mapBox.y + 200);
    await page.waitForTimeout(100);
    await page.mouse.click(mapBox.x + 600, mapBox.y + 300); // triggers Route #1 (500ms delay)

    await page.waitForTimeout(100);
    await page.locator('#swap-points-btn').click({ force: true }); // triggers Route #2 (100ms delay)

    // At t=250ms, Route #2 resolved with 7.00 km
    await page.waitForTimeout(250);
    const distT250 = await page.evaluate(() => document.getElementById('hud-distance')?.innerText);

    // At t=700ms, Route #1 (delayed 500ms) has resolved late
    await page.waitForTimeout(450);
    const distT700 = await page.evaluate(() => document.getElementById('hud-distance')?.innerText);

    const isStaleOverwrite = distT700 === '3.00';
    record(
      'T4: Out-of-Order Route Response Overwrite on Rapid Swap',
      'Concurrency',
      isStaleOverwrite ? 'VULNERABILITY' : 'PASS',
      {
        bugConfirmed: isStaleOverwrite,
        distanceAtT250: distT250,
        distanceAtT700: distT700,
        finding: isStaleOverwrite
          ? 'Late-resolving stale route #1 (3.00 km) overwrote newer route #2 (7.00 km)!'
          : 'App discarded out-of-order route response.'
      }
    );
    await page.close();
  }

  // TEST 5: Leaflet Pane Pointer Events Interception Defect
  {
    const page = await browser.newPage();
    await setupDefaultMocks(page);
    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 500, mapBox.y + 250);
    await page.waitForTimeout(200);

    const hitResult = await page.evaluate(() => {
      const markerEl = document.querySelector('.custom-leaflet-marker');
      if (!markerEl) return { error: 'marker not found' };
      const rect = markerEl.getBoundingClientRect();
      const hitEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const popupPane = document.querySelector('.leaflet-popup-pane');
      return {
        markerRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        hitTag: hitEl ? hitEl.tagName : null,
        hitClass: hitEl ? hitEl.className : null,
        popupPaneRect: popupPane ? popupPane.getBoundingClientRect() : null,
        isBlockedByPopupPane: hitEl && hitEl.classList.contains('leaflet-popup-pane')
      };
    });

    record(
      'T5: Leaflet Popup Pane Interception of Marker Pointer Events (CSS Defect)',
      'UI Layout & Interaction',
      hitResult.isBlockedByPopupPane ? 'VULNERABILITY' : 'PASS',
      {
        bugConfirmed: hitResult.isBlockedByPopupPane,
        hitElement: `<${hitResult.hitTag} class="${hitResult.hitClass}">`,
        popupPaneRect: hitResult.popupPaneRect,
        finding: hitResult.isBlockedByPopupPane
          ? 'CSS line .leaflet-pane { width: 100%; height: 100%; } in style.css stretches leaflet-popup-pane (z-index 700) across entire screen, blocking mouse/drag interaction with markers (z-index 600)!'
          : 'Markers receive pointer events directly.'
      }
    );
    await page.close();
  }

  // TEST 6: Provider Toggling Under Active Route (Leaflet <-> Google Maps)
  {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(e.message));
    await injectMockGoogleMaps(page);
    await setupDefaultMocks(page);
    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 500, mapBox.y + 250);
    await page.waitForTimeout(200);
    await page.mouse.click(mapBox.x + 650, mapBox.y + 350);
    await page.waitForTimeout(500);

    const initialLeaflet = await page.evaluate(() => {
      const mm = window.garminApp.mapManager;
      return {
        markers: mm.markersState.size,
        polylines: mm.polylinesState.size,
        polyPoints: mm.polylinesState.get('planned-route')?.points.length,
        startPos: mm.markersState.get('start')?.position,
        finishPos: mm.markersState.get('finish')?.position
      };
    });

    // Switch to Google
    await page.evaluate(async () => {
      await window.garminApp.mapManager.switchProvider('google', 'AIzaSyMockKey');
    });
    await page.waitForTimeout(300);

    const inGoogle = await page.evaluate(() => {
      const mm = window.garminApp.mapManager;
      return {
        provider: mm.getProviderName(),
        markers: mm.markersState.size,
        polylines: mm.polylinesState.size,
        adapterMarkers: mm.activeAdapter.markers.size,
        adapterPolylines: mm.activeAdapter.polylines.size
      };
    });

    // Switch back to Leaflet
    await page.evaluate(async () => {
      await window.garminApp.mapManager.switchProvider('leaflet');
    });
    await page.waitForTimeout(300);

    const restoredLeaflet = await page.evaluate(() => {
      const mm = window.garminApp.mapManager;
      return {
        provider: mm.getProviderName(),
        markers: mm.markersState.size,
        polylines: mm.polylinesState.size,
        polyPoints: mm.polylinesState.get('planned-route')?.points.length,
        adapterMarkers: mm.activeAdapter.markers.size,
        adapterPolylines: mm.activeAdapter.polylines.size,
        startPos: mm.markersState.get('start')?.position,
        finishPos: mm.markersState.get('finish')?.position
      };
    });

    // 10-Cycle Storm
    const stormResult = await page.evaluate(async () => {
      const mm = window.garminApp.mapManager;
      for (let i = 0; i < 10; i++) {
        await mm.switchProvider(i % 2 === 0 ? 'google' : 'leaflet', 'AIzaSyMockKey');
      }
      return {
        finalProvider: mm.getProviderName(),
        markers: mm.markersState.size,
        polylines: mm.polylinesState.size
      };
    });

    const togglePass = inGoogle.provider === 'google' &&
                      inGoogle.adapterMarkers === 2 &&
                      inGoogle.adapterPolylines === 1 &&
                      restoredLeaflet.provider === 'leaflet' &&
                      restoredLeaflet.adapterMarkers === 2 &&
                      restoredLeaflet.adapterPolylines === 1 &&
                      restoredLeaflet.polyPoints === initialLeaflet.polyPoints &&
                      stormResult.markers === 2 &&
                      stormResult.polylines === 1 &&
                      consoleErrors.length === 0;

    record('T6: Provider Toggling Under Active Route Display (Leaflet <-> Google Maps)', 'Provider Architecture', togglePass ? 'PASS' : 'FAIL', {
      initialLeaflet,
      inGoogle,
      restoredLeaflet,
      stormResult,
      zeroDataLoss: togglePass,
      consoleErrors
    });
    await page.close();
  }

  // TEST 7: Hard Network Drop -> Haversine 1.25x Fallback
  {
    const page = await browser.newPage();
    let dropCount = 0;
    await setupDefaultMocks(page);
    await page.route(/router\.project-osrm\.org\/route\/v1\/foot/, async (route) => {
      dropCount++;
      await route.abort('connectionfailed');
    });

    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 500, mapBox.y + 250);
    await page.waitForTimeout(200);
    await page.mouse.click(mapBox.x + 650, mapBox.y + 350);
    await page.waitForTimeout(600);

    const fallback = await page.evaluate(() => {
      const app = window.garminApp;
      const mm = app.mapManager;
      const hud = document.getElementById('route-hud');
      const distEl = document.getElementById('hud-distance');
      const badgeEl = document.getElementById('hud-source-badge');
      const poly = mm.polylinesState.get('planned-route');
      return {
        hudVisible: !hud.classList.contains('hidden'),
        distanceText: distEl ? distEl.innerText : null,
        badgeText: badgeEl ? badgeEl.innerText : null,
        polyPoints: poly ? poly.points.length : 0,
        markers: mm.markersState.size
      };
    });

    const distVal = parseFloat(fallback.distanceText);
    const dropPass = dropCount > 0 &&
                     fallback.hudVisible &&
                     !isNaN(distVal) && distVal > 0 &&
                     fallback.polyPoints >= 15 &&
                     /offline/i.test(fallback.badgeText) &&
                     fallback.markers === 2;

    record('T7: Hard Network Drop -> Resilient Haversine 1.25x Urban Circuity Fallback', 'Network Resilience', dropPass ? 'PASS' : 'FAIL', {
      droppedRequests: dropCount,
      hudVisible: fallback.hudVisible,
      distanceKm: fallback.distanceText,
      badge: fallback.badgeText,
      interpolatedPoints: fallback.polyPoints,
      fallbackActive: dropPass
    });
    await page.close();
  }

  await browser.close();

  console.log('\n================================================================');
  console.log('  TEST SUITE RUN COMPLETE');
  console.log('================================================================\n');

  return results;
}

runSuite().catch(err => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});
