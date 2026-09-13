/**
 * tests/adversarial_interaction_stress.js
 * Comprehensive Empirical Adversarial Stress Testing Harness for Milestone 1:
 * Map & Route Planner UI State Machine and Interactions.
 * 
 * Scenarios Tested:
 *  1. Rapid successive map clicks (A/B state machine stability under 50-click storm)
 *  2. Rapid button thrashing (Swap parity, interleaved Swap & Reset thrashing)
 *  3. Marker dragging chaos (Pointer-event interception defect, drag gestures, overlapping coordinates)
 *  4. Provider toggling (Leaflet <-> Google Maps active route zero-loss, 10-cycle storm, listener persistence)
 *  5. Network failure & in-flight concurrency (Connection drop fallback, timeout fallback, reset race condition, stale overwrite race)
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
            this.opts = opts || {};
            this.listeners = new Map();
            this.center = this.opts.center || { lat: 0, lng: 0 };
            this.zoom = this.opts.zoom || 14;
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
          fitBounds() {}
        },
        Marker: class {
          constructor(opts) {
            this.opts = opts || {};
            this.position = opts.position || { lat: 0, lng: 0 };
            this.listeners = new Map();
          }
          setPosition(p) { this.position = p; }
          getPosition() { return { lat: () => this.position.lat, lng: () => this.position.lng }; }
          setMap(m) { this.opts.map = m; }
          addListener(evt, cb) {
            if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
            this.listeners.get(evt).add(cb);
            return { remove: () => this.listeners.get(evt).delete(cb) };
          }
        },
        Polyline: class {
          constructor(opts) {
            this.opts = opts || {};
            this.path = opts.path || [];
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

async function setupNetworkMocks(page) {
  // Mock forward geocoding (Photon)
  await page.route(/photon\.komoot\.io\/api|nominatim\.openstreetmap\.org\/search/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        features: [{
          properties: { name: 'Avenida Paulista, 1000', city: 'São Paulo', state: 'SP' },
          geometry: { coordinates: [-46.6520, -23.5650] }
        }]
      })
    });
  });

  // Mock reverse geocoding (Photon)
  await page.route(/photon\.komoot\.io\/reverse/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        features: [{
          properties: { name: 'Rua Augusta, 500', city: 'São Paulo' }
        }]
      })
    });
  });

  // Default mock for OSRM foot routing: 5.40 km, 5 coordinates
  await page.route(/router\.project-osrm\.org\/route\/v1\/foot/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'Ok',
        routes: [{
          distance: 5400.0,
          duration: 1620.0,
          geometry: {
            type: 'LineString',
            coordinates: [
              [-46.6520, -23.5650],
              [-46.6540, -23.5670],
              [-46.6560, -23.5690],
              [-46.6580, -23.5710],
              [-46.6600, -23.5730]
            ]
          }
        }]
      })
    });
  });
}

export async function runAdversarialHarness() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const report = [];

  function recordResult(scenario, testId, title, verdict, metrics) {
    report.push({ scenario, testId, title, verdict, metrics });
    const tag = verdict === 'PASS' ? '✅ PASS' : (verdict === 'VULNERABILITY' ? '🚨 VULNERABILITY' : '❌ FAIL');
    console.log(`[${tag}] [${scenario}] ${testId}: ${title}`);
    console.log('   Metrics:', JSON.stringify(metrics, null, 2));
  }

  console.log('========================================================================');
  console.log(' GARMIN RUNNING TRACKER — EMPIRICAL CHALLENGER ADVERSARIAL STRESS SUITE');
  console.log(' Target: Milestone 1 UI & Map State Machine Interactions');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // SCENARIO 1: RAPID SUCCESSIVE MAP CLICKS
  // ---------------------------------------------------------------------------
  console.log('>>> EXECUTING SCENARIO 1: RAPID SUCCESSIVE MAP CLICKS');

  // 1.1: 50 successive map clicks in 2.5s across diverse screen coordinates
  {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(e.message));

    await setupNetworkMocks(page);
    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    const clickCount = 50;
    const startX = mapBox.x + 400;
    const startY = mapBox.y + 150;
    const t0 = Date.now();

    for (let i = 0; i < clickCount; i++) {
      const cx = startX + (i % 7) * 35;
      const cy = startY + Math.floor(i / 7) * 35;
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(40);
    }
    const elapsed = Date.now() - t0;
    await page.waitForTimeout(500);

    const state = await page.evaluate(() => {
      const app = window.garminApp;
      return {
        markersCount: app.mapManager.markersState.size,
        domMarkerCount: document.querySelectorAll('.custom-leaflet-marker').length,
        polylinesCount: app.mapManager.polylinesState.size,
        hasPointA: Boolean(app.routePlanner.pointA),
        hasPointB: Boolean(app.routePlanner.pointB),
        startVal: document.getElementById('start-input')?.value,
        finishVal: document.getElementById('finish-input')?.value,
        hudDistance: document.getElementById('hud-distance')?.innerText
      };
    });

    const isStable = state.markersCount === 2 &&
                     state.domMarkerCount === 2 &&
                     state.polylinesCount === 1 &&
                     state.hasPointA &&
                     state.hasPointB &&
                     consoleErrors.length === 0;

    recordResult('Scenario 1', 'S1.1', '50 Rapid Map Clicks State Machine Bounding', isStable ? 'PASS' : 'FAIL', {
      clicksAttempted: clickCount,
      elapsedMs: elapsed,
      markersInState: state.markersCount,
      domMarkers: state.domMarkerCount,
      polylinesInState: state.polylinesCount,
      hudDistance: state.hudDistance,
      consoleErrors
    });
    await page.close();
  }

  // 1.2: Map click during in-flight address reverse geocoding
  {
    const page = await browser.newPage();
    let reverseCallCount = 0;
    await page.route(/photon\.komoot\.io\/reverse/, async (route) => {
      reverseCallCount++;
      await new Promise(r => setTimeout(r, 200));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          features: [{ properties: { name: `Resolved Address ${reverseCallCount}` } }]
        })
      });
    });
    await setupNetworkMocks(page);
    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    // Click 1 (Point A)
    await page.mouse.click(mapBox.x + 450, mapBox.y + 200);
    // Immediately click 2 (Point B) while reverse geocode 1 is in-flight
    await page.waitForTimeout(30);
    await page.mouse.click(mapBox.x + 600, mapBox.y + 300);
    await page.waitForTimeout(400);

    const values = await page.evaluate(() => ({
      startVal: document.getElementById('start-input')?.value,
      finishVal: document.getElementById('finish-input')?.value,
      pointA: window.garminApp.routePlanner.pointA?.label,
      pointB: window.garminApp.routePlanner.pointB?.label
    }));

    const passed = values.startVal.length > 0 &&
                   values.finishVal.length > 0 &&
                   values.startVal !== 'Localizando endereço...' &&
                   values.finishVal !== 'Localizando endereço...';

    recordResult('Scenario 1', 'S1.2', 'Rapid Clicks During In-Flight Reverse Geocoding', passed ? 'PASS' : 'FAIL', {
      reverseCallCount,
      values
    });
    await page.close();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 2: RAPID BUTTON THRASHING (SWAP & RESET)
  // ---------------------------------------------------------------------------
  console.log('\n>>> EXECUTING SCENARIO 2: RAPID BUTTON THRASHING');

  // 2.1: Swap thrashing parity test (30 rapid clicks at 25ms interval)
  {
    const page = await browser.newPage();
    await setupNetworkMocks(page);
    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 450, mapBox.y + 200);
    await page.waitForTimeout(100);
    await page.mouse.click(mapBox.x + 600, mapBox.y + 300);
    await page.waitForTimeout(300);

    const initialPos = await page.evaluate(() => ({
      start: { ...window.garminApp.routePlanner.pointA.position },
      finish: { ...window.garminApp.routePlanner.pointB.position }
    }));

    const swapBtn = page.locator('#swap-points-btn');
    const swapCount = 30; // Even number -> final should equal initial
    for (let i = 0; i < swapCount; i++) {
      await swapBtn.click({ force: true });
      await page.waitForTimeout(25);
    }
    await page.waitForTimeout(400);

    const finalPos = await page.evaluate(() => ({
      start: { ...window.garminApp.routePlanner.pointA.position },
      finish: { ...window.garminApp.routePlanner.pointB.position },
      markersCount: window.garminApp.mapManager.markersState.size,
      polylinesCount: window.garminApp.mapManager.polylinesState.size
    }));

    const parityMatch = Math.abs(finalPos.start.lat - initialPos.start.lat) < 0.0001 &&
                        Math.abs(finalPos.finish.lat - initialPos.finish.lat) < 0.0001 &&
                        finalPos.markersCount === 2 &&
                        finalPos.polylinesCount === 1;

    recordResult('Scenario 2', 'S2.1', 'Swap Parity Thrashing (30 Rapid Swaps at 25ms)', parityMatch ? 'PASS' : 'FAIL', {
      swapCycles: swapCount,
      initialPos,
      finalPos,
      parityMatch
    });
    await page.close();
  }

  // 2.2: Interleaved Swap & Reset thrashing (rapid alternation)
  {
    const page = await browser.newPage();
    await setupNetworkMocks(page);
    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 450, mapBox.y + 200);
    await page.waitForTimeout(100);
    await page.mouse.click(mapBox.x + 600, mapBox.y + 300);
    await page.waitForTimeout(300);

    const swapBtn = page.locator('#swap-points-btn');
    const resetBtn = page.locator('#reset-route-btn');

    // Thrash 15 rounds of swap followed immediately by reset
    for (let i = 0; i < 15; i++) {
      await swapBtn.click({ force: true });
      await resetBtn.click({ force: true });
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(300);

    const postThrashState = await page.evaluate(() => {
      const app = window.garminApp;
      const rp = app.routePlanner;
      const mm = app.mapManager;
      const hud = document.getElementById('route-hud');
      return {
        pointA: rp.pointA,
        pointB: rp.pointB,
        startInputValue: document.getElementById('start-input')?.value,
        finishInputValue: document.getElementById('finish-input')?.value,
        markersInState: mm.markersState.size,
        polylinesInState: mm.polylinesState.size,
        hudHidden: hud.classList.contains('hidden')
      };
    });

    const isCleanlyReset = postThrashState.pointA === null &&
                          postThrashState.pointB === null &&
                          postThrashState.startInputValue === '' &&
                          postThrashState.finishInputValue === '' &&
                          postThrashState.markersInState === 0 &&
                          postThrashState.polylinesInState === 0 &&
                          postThrashState.hudHidden;

    recordResult('Scenario 2', 'S2.2', 'Interleaved Swap & Reset Thrashing (15 Fast Cycles)', isCleanlyReset ? 'PASS' : 'FAIL', {
      postThrashState,
      isCleanlyReset
    });
    await page.close();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 3: MARKER DRAGGING CHAOS & INTERACTION DEFECTS
  // ---------------------------------------------------------------------------
  console.log('\n>>> EXECUTING SCENARIO 3: MARKER DRAGGING CHAOS & INTERACTION DEFECTS');

  // 3.1: Pointer Event Hit Test: Does mouse event hit marker or popup pane?
  {
    const page = await browser.newPage();
    await setupNetworkMocks(page);
    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 500, mapBox.y + 250);
    await page.waitForTimeout(200);

    const hitAnalysis = await page.evaluate(() => {
      const markerEl = document.querySelector('.custom-leaflet-marker');
      if (!markerEl) return { error: 'marker not found' };
      const rect = markerEl.getBoundingClientRect();
      const hitEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const popupPane = document.querySelector('.leaflet-popup-pane');
      const markerPane = document.querySelector('.leaflet-marker-pane');
      return {
        markerRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        hitTag: hitEl ? hitEl.tagName : null,
        hitClassName: hitEl ? hitEl.className : null,
        hitElementMatchesMarker: hitEl ? (markerEl.contains(hitEl) || hitEl === markerEl) : false,
        popupPaneComputedWidth: popupPane ? window.getComputedStyle(popupPane).width : null,
        popupPaneComputedHeight: popupPane ? window.getComputedStyle(popupPane).height : null,
        popupPanePointerEvents: popupPane ? window.getComputedStyle(popupPane).pointerEvents : null,
        markerPaneZIndex: markerPane ? window.getComputedStyle(markerPane).zIndex : null,
        popupPaneZIndex: popupPane ? window.getComputedStyle(popupPane).zIndex : null,
        isBlockedByPopupPane: hitEl && hitEl.classList.contains('leaflet-popup-pane')
      };
    });

    recordResult('Scenario 3', 'S3.1', 'Leaflet Popup Pane Marker Pointer Interception Check', hitAnalysis.isBlockedByPopupPane ? 'VULNERABILITY' : 'PASS', {
      hitAnalysis,
      explanation: hitAnalysis.isBlockedByPopupPane
        ? 'Defect confirmed: .leaflet-pane { width: 100%; height: 100% } in style.css:172 expands leaflet-popup-pane (z-index 700) over whole screen, intercepting pointer events intended for markers (z-index 600)!'
        : 'Marker receives direct pointer events.'
    });
    await page.close();
  }

  // 3.2: Direct Drag Gesture Attempt (Start Marker)
  {
    const page = await browser.newPage();
    await setupNetworkMocks(page);
    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    // Place Point A
    await page.mouse.click(mapBox.x + 450, mapBox.y + 200);
    await page.waitForTimeout(200);

    const initialCoord = await page.evaluate(() => window.garminApp.routePlanner.pointA?.position);

    // Get marker element bounding box
    const marker = page.locator('.custom-leaflet-marker').first();
    const mBox = await marker.boundingBox();

    let dragSucceeded = false;
    let finalCoord = null;

    if (mBox) {
      // Perform standard drag gesture on the marker
      await page.mouse.move(mBox.x + mBox.width / 2, mBox.y + mBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(mBox.x + mBox.width / 2 + 150, mBox.y + mBox.height / 2 + 100, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(300);

      finalCoord = await page.evaluate(() => window.garminApp.routePlanner.pointA?.position);
      dragSucceeded = finalCoord && (
        Math.abs(finalCoord.lat - initialCoord.lat) > 0.0001 ||
        Math.abs(finalCoord.lng - initialCoord.lng) > 0.0001
      );
    }

    recordResult('Scenario 3', 'S3.2', 'Physical Mouse Drag Gesture on Start Marker', dragSucceeded ? 'PASS' : 'VULNERABILITY', {
      markerFound: Boolean(mBox),
      initialCoord,
      finalCoord,
      dragSucceeded,
      finding: !dragSucceeded
        ? 'Physical drag on marker did not move marker because popup-pane intercepted mouse events and panned the map instead!'
        : 'Marker dragged and updated coordinates successfully.'
    });
    await page.close();
  }

  // 3.3: Overlapping Coordinates (Finish placed directly on top of Start)
  {
    const page = await browser.newPage();
    await setupNetworkMocks(page);
    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const startInput = page.locator('#start-input');
    const finishInput = page.locator('#finish-input');
    const calcBtn = page.locator('#calculate-route-btn');

    await startInput.fill('Avenida Paulista, 1000');
    await finishInput.fill('Avenida Paulista, 1000'); // Identical address strings
    await calcBtn.click();
    await page.waitForTimeout(300);

    const toastText = await page.evaluate(() => {
      const toast = document.querySelector('.toast');
      return toast ? toast.innerText : null;
    });

    const routeTriggered = await page.evaluate(() => {
      const app = window.garminApp;
      return app.mapManager.polylinesState.size > 0;
    });

    const rejectionPassed = toastText && /iguais|idênticos|mesmo local/i.test(toastText) && !routeTriggered;

    recordResult('Scenario 3', 'S3.3', 'Overlapping / Identical Points Validation Guard', rejectionPassed ? 'PASS' : 'FAIL', {
      toastText,
      routeTriggered,
      rejectionPassed
    });
    await page.close();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 4: PROVIDER TOGGLING (LEAFLET <-> GOOGLE MAPS)
  // ---------------------------------------------------------------------------
  console.log('\n>>> EXECUTING SCENARIO 4: PROVIDER TOGGLING');

  // 4.1: Provider Toggling under active route with Zero Data Loss
  {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(e.message));

    await injectMockGoogleMaps(page);
    await setupNetworkMocks(page);
    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 450, mapBox.y + 200);
    await page.waitForTimeout(100);
    await page.mouse.click(mapBox.x + 600, mapBox.y + 300);
    await page.waitForTimeout(400);

    const initialLeaflet = await page.evaluate(() => {
      const mm = window.garminApp.mapManager;
      return {
        provider: mm.getProviderName(),
        markers: mm.markersState.size,
        polylines: mm.polylinesState.size,
        pointsCount: mm.polylinesState.get('planned-route')?.points.length,
        startPos: mm.markersState.get('start')?.position,
        finishPos: mm.markersState.get('finish')?.position
      };
    });

    // Switch to Google Maps
    await page.evaluate(async () => {
      await window.garminApp.mapManager.switchProvider('google', 'AIzaSyMockValidKey');
    });
    await page.waitForTimeout(300);

    const inGoogleState = await page.evaluate(() => {
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

    const restoredLeafletState = await page.evaluate(() => {
      const mm = window.garminApp.mapManager;
      return {
        provider: mm.getProviderName(),
        markers: mm.markersState.size,
        polylines: mm.polylinesState.size,
        pointsCount: mm.polylinesState.get('planned-route')?.points.length,
        adapterMarkers: mm.activeAdapter.markers.size,
        adapterPolylines: mm.activeAdapter.polylines.size,
        startPos: mm.markersState.get('start')?.position,
        finishPos: mm.markersState.get('finish')?.position
      };
    });

    const isDataPreserved = inGoogleState.provider === 'google' &&
                            inGoogleState.adapterMarkers === 2 &&
                            inGoogleState.adapterPolylines === 1 &&
                            restoredLeafletState.provider === 'leaflet' &&
                            restoredLeafletState.adapterMarkers === 2 &&
                            restoredLeafletState.adapterPolylines === 1 &&
                            restoredLeafletState.pointsCount === initialLeaflet.pointsCount &&
                            consoleErrors.length === 0;

    recordResult('Scenario 4', 'S4.1', 'Provider Round-Trip Active Route Preservation', isDataPreserved ? 'PASS' : 'FAIL', {
      initialLeaflet,
      inGoogleState,
      restoredLeafletState,
      consoleErrors
    });
    await page.close();
  }

  // 4.2: 10-Cycle Provider Toggle Storm
  {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(e.message));

    await injectMockGoogleMaps(page);
    await setupNetworkMocks(page);
    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 450, mapBox.y + 200);
    await page.waitForTimeout(100);
    await page.mouse.click(mapBox.x + 600, mapBox.y + 300);
    await page.waitForTimeout(400);

    // 10 cycles back and forth
    const stormResult = await page.evaluate(async () => {
      const mm = window.garminApp.mapManager;
      for (let i = 0; i < 10; i++) {
        await mm.switchProvider(i % 2 === 0 ? 'google' : 'leaflet', 'AIzaSyMockValidKey');
      }
      return {
        finalProvider: mm.getProviderName(),
        markers: mm.markersState.size,
        polylines: mm.polylinesState.size,
        activeAdapterMarkers: mm.activeAdapter?.markers?.size,
        activeAdapterPolylines: mm.activeAdapter?.polylines?.size
      };
    });

    const stormPassed = stormResult.markers === 2 &&
                        stormResult.polylines === 1 &&
                        stormResult.activeAdapterMarkers === 2 &&
                        stormResult.activeAdapterPolylines === 1 &&
                        consoleErrors.length === 0;

    recordResult('Scenario 4', 'S4.2', '10-Cycle Provider Rapid Toggle Storm', stormPassed ? 'PASS' : 'FAIL', {
      stormResult,
      consoleErrors
    });
    await page.close();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 5: NETWORK FAILURE / TIMEOUT & CONCURRENCY ANOMALIES
  // ---------------------------------------------------------------------------
  console.log('\n>>> EXECUTING SCENARIO 5: NETWORK FAILURE & CONCURRENCY ANOMALIES');

  // 5.1: Network drop (connectionfailed) -> Resilient Haversine 1.25x fallback
  {
    const page = await browser.newPage();
    let dropCount = 0;
    await setupNetworkMocks(page);
    await page.route(/router\.project-osrm\.org\/route\/v1\/foot/, async (route) => {
      dropCount++;
      await route.abort('connectionfailed');
    });

    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 500, mapBox.y + 250);
    await page.waitForTimeout(150);
    await page.mouse.click(mapBox.x + 650, mapBox.y + 350);
    await page.waitForTimeout(500);

    const fallbackState = await page.evaluate(() => {
      const app = window.garminApp;
      const mm = app.mapManager;
      const hud = document.getElementById('route-hud');
      const distEl = document.getElementById('hud-distance');
      const badgeEl = document.getElementById('hud-source-badge');
      const poly = mm.polylinesState.get('planned-route');
      return {
        hudVisible: !hud.classList.contains('hidden'),
        distanceText: distEl?.innerText,
        badgeText: badgeEl?.innerText,
        polyPointsCount: poly ? poly.points.length : 0,
        markersCount: mm.markersState.size
      };
    });

    const distNum = parseFloat(fallbackState.distanceText);
    const dropPassed = dropCount > 0 &&
                       fallbackState.hudVisible &&
                       !isNaN(distNum) && distNum > 0 &&
                       fallbackState.polyPointsCount >= 15 &&
                       /offline/i.test(fallbackState.badgeText) &&
                       fallbackState.markersCount === 2;

    recordResult('Scenario 5', 'S5.1', 'Hard Network Drop Haversine 1.25x Fallback', dropPassed ? 'PASS' : 'FAIL', {
      droppedRequests: dropCount,
      distanceKm: fallbackState.distanceText,
      badge: fallbackState.badgeText,
      interpolatedPoints: fallbackState.polyPointsCount,
      fallbackActive: dropPassed
    });
    await page.close();
  }

  // 5.2: Network timeout (>4000ms) -> Clean Haversine 1.25x fallback
  {
    const page = await browser.newPage();
    let timeoutFired = false;
    await setupNetworkMocks(page);
    await page.route(/router\.project-osrm\.org\/route\/v1\/foot/, async (route) => {
      timeoutFired = true;
      // Sleep longer than the 4000ms AbortController timeout
      await new Promise(r => setTimeout(r, 4500));
      try {
        await route.fulfill({ status: 200, body: '{}' });
      } catch (e) {}
    });

    await page.goto(BASE_URL);
    await page.waitForSelector('#map-container');

    const mapBox = await page.locator('#map-container').boundingBox();
    await page.mouse.click(mapBox.x + 500, mapBox.y + 250);
    await page.waitForTimeout(150);
    await page.mouse.click(mapBox.x + 650, mapBox.y + 350);

    // Wait for 4000ms timeout guard to trip + 500ms grace period
    await page.waitForTimeout(4600);

    const timeoutFallbackState = await page.evaluate(() => {
      const app = window.garminApp;
      const mm = app.mapManager;
      const hud = document.getElementById('route-hud');
      const distEl = document.getElementById('hud-distance');
      const badgeEl = document.getElementById('hud-source-badge');
      const poly = mm.polylinesState.get('planned-route');
      return {
        hudVisible: !hud.classList.contains('hidden'),
        distanceText: distEl?.innerText,
        badgeText: badgeEl?.innerText,
        polyPointsCount: poly ? poly.points.length : 0
      };
    });

    const timeoutPassed = timeoutFired &&
                          timeoutFallbackState.hudVisible &&
                          parseFloat(timeoutFallbackState.distanceText) > 0 &&
                          /offline/i.test(timeoutFallbackState.badgeText);

    recordResult('Scenario 5', 'S5.2', '4000ms Network Timeout Fallback Guard', timeoutPassed ? 'PASS' : 'FAIL', {
      timeoutFired,
      distanceKm: timeoutFallbackState.distanceText,
      badge: timeoutFallbackState.badgeText,
      interpolatedPoints: timeoutFallbackState.polyPointsCount,
      timeoutPassed
    });
    await page.close();
  }

  // 5.3: Concurrency Race Condition: In-Flight Route vs Reset
  {
    const page = await browser.newPage();
    await setupNetworkMocks(page);
    await page.route(/router\.project-osrm\.org\/route\/v1\/foot/, async (route) => {
      // Simulate 450ms network delay
      await new Promise(r => setTimeout(r, 450));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'Ok',
          routes: [{
            distance: 4200.0,
            duration: 1260.0,
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
    await page.mouse.click(mapBox.x + 600, mapBox.y + 300); // Route requested with 450ms delay

    // User clicks Reset at 60ms (while route is in flight)
    await page.waitForTimeout(60);
    await page.locator('#reset-route-btn').click({ force: true });

    // Wait 600ms for delayed route response to resolve
    await page.waitForTimeout(600);

    const ghostState = await page.evaluate(() => {
      const app = window.garminApp;
      const hud = document.getElementById('route-hud');
      return {
        markersCount: app.mapManager.markersState.size,
        polylinesCount: app.mapManager.polylinesState.size,
        hudHidden: hud.classList.contains('hidden'),
        hudDistance: document.getElementById('hud-distance')?.innerText
      };
    });

    const isVulnerable = ghostState.polylinesCount > 0 || !ghostState.hudHidden;
    recordResult('Scenario 5', 'S5.3', 'In-Flight Route vs Immediate Reset Race Condition', isVulnerable ? 'VULNERABILITY' : 'PASS', {
      ghostState,
      finding: isVulnerable
        ? 'Confirmed Race Vulnerability: Late OSRM response rendered ghost polyline and unhid HUD on an emptied map after reset!'
        : 'Clean: late route response discarded after reset.'
    });
    await page.close();
  }

  // 5.4: Concurrency Out-of-Order Overwrite on Rapid Swap
  {
    const page = await browser.newPage();
    let reqSequence = 0;
    await setupNetworkMocks(page);
    await page.route(/router\.project-osrm\.org\/route\/v1\/foot/, async (route) => {
      reqSequence++;
      const currentId = reqSequence;
      if (currentId === 1) {
        // Stale initial route delayed 500ms
        await new Promise(r => setTimeout(r, 500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'Ok',
            routes: [{
              distance: 3100.0, // 3.10 km (stale)
              duration: 930.0,
              geometry: { type: 'LineString', coordinates: [[-46.65, -23.58], [-46.66, -23.59]] }
            }]
          })
        });
      } else {
        // Newer swapped route resolves in 100ms
        await new Promise(r => setTimeout(r, 100));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'Ok',
            routes: [{
              distance: 8200.0, // 8.20 km (newer)
              duration: 2460.0,
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
    await page.mouse.click(mapBox.x + 600, mapBox.y + 300); // Req #1 (500ms delay)

    await page.waitForTimeout(80);
    await page.locator('#swap-points-btn').click({ force: true }); // Req #2 (100ms delay)

    // At t=250ms, Req #2 has resolved -> distance should be 8.20 km
    await page.waitForTimeout(250);
    const distAtT250 = await page.evaluate(() => document.getElementById('hud-distance')?.innerText);

    // At t=700ms, Req #1 (delayed 500ms) has completed
    await page.waitForTimeout(450);
    const distAtT700 = await page.evaluate(() => document.getElementById('hud-distance')?.innerText);

    const isStaleOverwrite = distAtT700 === '3.10';
    recordResult('Scenario 5', 'S5.4', 'Out-of-Order Route Response Overwrite on Rapid Swap', isStaleOverwrite ? 'VULNERABILITY' : 'PASS', {
      distAtT250,
      distAtT700,
      isStaleOverwrite,
      finding: isStaleOverwrite
        ? 'Confirmed Race Vulnerability: Late-resolving initial route (3.10 km) overwrote newer swapped route (8.20 km) in the HUD!'
        : 'Clean: Out-of-order stale response ignored.'
    });
    await page.close();
  }

  await browser.close();

  console.log('\n========================================================================');
  console.log(' ADVERSARIAL HARNESS EXECUTION COMPLETE');
  console.log(' Summary:');
  const passCount = report.filter(r => r.verdict === 'PASS').length;
  const vulnCount = report.filter(r => r.verdict === 'VULNERABILITY').length;
  const failCount = report.filter(r => r.verdict === 'FAIL').length;
  console.log(` Total Tests: ${report.length} | Passed: ${passCount} | Vulnerabilities: ${vulnCount} | Failed: ${failCount}`);
  console.log('========================================================================\n');

  return report;
}

runAdversarialHarness().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
