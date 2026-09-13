/**
 * tests/empirical_concurrency_stress.js
 * Empirical Challenger Extreme Concurrency Stress Testing Harness for Milestone 1:
 * Asynchronous Route Calculations under Heavy Concurrency & Throttled Latency.
 * 
 * Verifies:
 * 1. 20 interleaved point selections, swaps, resets, and drags with network throttling (100-800ms jitter).
 * 2. Strict map state, polyline, and HUD metric consistency with latest active markers.
 * 3. Zero orphaned markers (in mapManager state, Leaflet adapter, and DOM).
 * 4. Zero mismatched distance readings (HUD distance mathematically matches active markers).
 * 5. In-flight race resolution when sequence terminates on Reset.
 * 6. Fault-injected network conditions (500s and aborts) under rapid concurrency.
 * 7. Multi-cycle burst stress (5 cycles x 20 actions = 100 operations).
 */

import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function haversineDistanceKm(p1, p2) {
  const R = 6371.0088;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return R * c;
}

// Deterministic distance formula used by our mock OSRM server:
// Distance is geodesic * 1.30 (in km, 2 decimals)
function calculateMockRouteDistance(start, finish) {
  const dist = haversineDistanceKm(start, finish) * 1.30;
  return Number(dist.toFixed(2));
}

async function setupThrottledNetworkMocks(page, options = {}) {
  const {
    minLatency = 150,
    maxLatency = 700,
    injectFailures = false,
    outOfOrder = true
  } = options;

  let osrmRequestCount = 0;
  let reverseRequestCount = 0;
  const requestLog = [];

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

  // Mock reverse geocoding (Photon) with latency
  await page.route(/photon\.komoot\.io\/reverse/, async (route) => {
    reverseRequestCount++;
    const delay = Math.floor(Math.random() * 150) + 50;
    await new Promise(r => setTimeout(r, delay));
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          features: [{
            properties: { name: `Rua Augusta, ${100 + reverseRequestCount}`, city: 'São Paulo' }
          }]
        })
      });
    } catch (e) {}
  });

  // Mock OSRM Foot Routing with Throttled Latency & Jitter
  await page.route(/router\.project-osrm\.org\/route\/v1\/foot\/(.*)/, async (route) => {
    osrmRequestCount++;
    const currentReqId = osrmRequestCount;
    const url = route.request().url();

    // Extract start and finish coords from URL: .../foot/{lng1},{lat1};{lng2},{lat2}?overview=...
    const match = url.match(/foot\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/);
    let start = { lat: 0, lng: 0 };
    let finish = { lat: 0, lng: 0 };
    if (match) {
      start = { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
      finish = { lng: parseFloat(match[3]), lat: parseFloat(match[4]) };
    }

    const expectedDistanceKm = calculateMockRouteDistance(start, finish);

    // Calculate latency: jittered or out-of-order
    let delay = Math.floor(Math.random() * (maxLatency - minLatency)) + minLatency;
    if (outOfOrder) {
      // Invert delays for consecutive requests to guarantee race conditions
      delay = (currentReqId % 2 === 1) ? maxLatency : minLatency;
    }

    const logEntry = {
      reqId: currentReqId,
      start,
      finish,
      expectedDistanceKm,
      delay,
      timestamp: Date.now()
    };
    requestLog.push(logEntry);

    // Optional fault injection
    if (injectFailures && currentReqId % 3 === 0) {
      await new Promise(r => setTimeout(r, Math.min(delay, 200)));
      try {
        if (currentReqId % 6 === 0) {
          await route.abort('connectionfailed');
        } else {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Internal Server Error' })
          });
        }
      } catch (e) {}
      return;
    }

    await new Promise(r => setTimeout(r, delay));

    // Generate 5 synthetic route points between start and finish
    const coords = [
      [start.lng, start.lat],
      [start.lng + (finish.lng - start.lng) * 0.25, start.lat + (finish.lat - start.lat) * 0.25],
      [start.lng + (finish.lng - start.lng) * 0.50, start.lat + (finish.lat - start.lat) * 0.50],
      [start.lng + (finish.lng - start.lng) * 0.75, start.lat + (finish.lat - start.lat) * 0.75],
      [finish.lng, finish.lat]
    ];

    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'Ok',
          routes: [{
            distance: expectedDistanceKm * 1000,
            duration: expectedDistanceKm * 330,
            geometry: {
              type: 'LineString',
              coordinates: coords
            }
          }]
        })
      });
    } catch (e) {}
  });

  return {
    getRequestLog: () => requestLog,
    getOsrmCount: () => osrmRequestCount,
    getReverseCount: () => reverseRequestCount
  };
}

async function dragMarkerById(page, markerId, dx, dy) {
  const box = await page.evaluate((id) => {
    const app = window.garminApp;
    if (!app || !app.mapManager || !app.mapManager.activeAdapter) return null;
    const marker = app.mapManager.activeAdapter.markers.get(id);
    if (!marker) return null;
    const el = marker.getElement();
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }, markerId);

  if (!box) return false;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 3 });
  await page.mouse.up();
  return true;
}

export async function runConcurrencyStressSuite() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const results = [];

  function record(suiteId, testId, title, verdict, metrics) {
    results.push({ suiteId, testId, title, verdict, metrics });
    const symbol = verdict === 'PASS' ? '✅ PASS' : (verdict === 'VULNERABILITY' ? '🚨 VULNERABILITY' : '❌ FAIL');
    console.log(`[${symbol}] [${suiteId}] ${testId}: ${title}`);
    console.log('   Metrics:', JSON.stringify(metrics, null, 2));
  }

  console.log('========================================================================');
  console.log(' GARMIN RUNNING TRACKER — EMPIRICAL CONCURRENCY STRESS HARNESS');
  console.log(' Focus: Extreme Asynchronous Route Concurrency, Latency Throttling,');
  console.log('        Zero Orphaned Markers & Zero Mismatched Distance Readings');
  console.log('========================================================================\n');

  // ===========================================================================
  // TEST SUITE 1: 20 RAPID INTERLEAVED ACTIONS UNDER SEVERE LATENCY JITTER
  // ===========================================================================
  console.log('>>> TEST SUITE 1: 20 RAPID INTERLEAVED ACTIONS UNDER SEVERE LATENCY JITTER');
  {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(e.stack || e.message));

    const netMock = await setupThrottledNetworkMocks(page, {
      minLatency: 150,
      maxLatency: 650,
      outOfOrder: true
    });

    await page.goto(BASE_URL);
    await page.waitForFunction(() => window.garminApp && window.garminApp.mapManager && window.garminApp.mapManager.activeAdapter?.map);
    const mapBox = await page.locator('#map-container').boundingBox();
    const swapBtn = page.locator('#swap-points-btn');
    const resetBtn = page.locator('#reset-route-btn');

    const tStart = Date.now();
    const actionLog = [];

    // --- 20 Rapidly Interleaved Operations ---
    // 1. Click Map for Point A
    await page.mouse.click(mapBox.x + 350, mapBox.y + 150);
    actionLog.push({ step: 1, action: 'MAP_CLICK_A', x: 350, y: 150 });
    await page.waitForTimeout(40);

    // 2. Click Map for Point B -> Triggers Route #1 (delayed 650ms)
    await page.mouse.click(mapBox.x + 550, mapBox.y + 250);
    actionLog.push({ step: 2, action: 'MAP_CLICK_B', x: 550, y: 250 });
    await page.waitForTimeout(40);

    // 3. Swap Points -> Triggers Route #2 (delayed 150ms)
    await swapBtn.click({ force: true });
    actionLog.push({ step: 3, action: 'SWAP' });
    await page.waitForTimeout(40);

    // 4. Drag Start Marker -> Triggers Route #3 (delayed 650ms)
    await dragMarkerById(page, 'start', 40, 30);
    actionLog.push({ step: 4, action: 'DRAG_A' });
    await page.waitForTimeout(40);

    // 5. Drag Finish Marker -> Triggers Route #4 (delayed 150ms)
    await dragMarkerById(page, 'finish', -30, 40);
    actionLog.push({ step: 5, action: 'DRAG_B' });
    await page.waitForTimeout(40);

    // 6. Swap Points -> Triggers Route #5 (delayed 650ms)
    await swapBtn.click({ force: true });
    actionLog.push({ step: 6, action: 'SWAP' });
    await page.waitForTimeout(40);

    // 7. Reset Button -> Resets everything while 5 routes are in-flight!
    await resetBtn.click({ force: true });
    actionLog.push({ step: 7, action: 'RESET' });
    await page.waitForTimeout(50);

    // 8. Click Map for Point A
    await page.mouse.click(mapBox.x + 400, mapBox.y + 200);
    actionLog.push({ step: 8, action: 'MAP_CLICK_A', x: 400, y: 200 });
    await page.waitForTimeout(40);

    // 9. Drag Start Marker
    await dragMarkerById(page, 'start', 30, -20);
    actionLog.push({ step: 9, action: 'DRAG_A' });
    await page.waitForTimeout(40);

    // 10. Click Map for Point B -> Triggers Route #6
    await page.mouse.click(mapBox.x + 600, mapBox.y + 300);
    actionLog.push({ step: 10, action: 'MAP_CLICK_B', x: 600, y: 300 });
    await page.waitForTimeout(40);

    // 11. Swap Points -> Triggers Route #7
    await swapBtn.click({ force: true });
    actionLog.push({ step: 11, action: 'SWAP' });
    await page.waitForTimeout(40);

    // 12. Drag Start Marker -> Triggers Route #8
    await dragMarkerById(page, 'start', 50, 40);
    actionLog.push({ step: 12, action: 'DRAG_A' });
    await page.waitForTimeout(40);

    // 13. Drag Finish Marker -> Triggers Route #9
    await dragMarkerById(page, 'finish', -40, -30);
    actionLog.push({ step: 13, action: 'DRAG_B' });
    await page.waitForTimeout(40);

    // 14. Swap Points -> Triggers Route #10
    await swapBtn.click({ force: true });
    actionLog.push({ step: 14, action: 'SWAP' });
    await page.waitForTimeout(40);

    // 15. Reset Button -> Clears route and markers
    await resetBtn.click({ force: true });
    actionLog.push({ step: 15, action: 'RESET' });
    await page.waitForTimeout(50);

    // 16. Click Map for Point A
    await page.mouse.click(mapBox.x + 450, mapBox.y + 220);
    actionLog.push({ step: 16, action: 'MAP_CLICK_A', x: 450, y: 220 });
    await page.waitForTimeout(40);

    // 17. Click Map for Point B -> Triggers Route #11
    await page.mouse.click(mapBox.x + 650, mapBox.y + 320);
    actionLog.push({ step: 17, action: 'MAP_CLICK_B', x: 650, y: 320 });
    await page.waitForTimeout(40);

    // 18. Drag Start Marker -> Triggers Route #12
    await dragMarkerById(page, 'start', -30, 20);
    actionLog.push({ step: 18, action: 'DRAG_A' });
    await page.waitForTimeout(40);

    // 19. Drag Finish Marker -> Triggers Route #13
    await dragMarkerById(page, 'finish', 30, -30);
    actionLog.push({ step: 19, action: 'DRAG_B' });
    await page.waitForTimeout(40);

    // 20. Swap Points -> Triggers Route #14
    await swapBtn.click({ force: true });
    actionLog.push({ step: 20, action: 'SWAP' });

    const totalBurstDurationMs = Date.now() - tStart;

    // Wait for all throttled network requests to completely settle
    await page.waitForTimeout(1500);

    // --- State Inspection ---
    const finalState = await page.evaluate(() => {
      const app = window.garminApp;
      const mm = app.mapManager;
      const rp = app.routePlanner;
      const hud = document.getElementById('route-hud');
      const distEl = document.getElementById('hud-distance');
      const badgeEl = document.getElementById('hud-source-badge');

      const domMarkers = Array.from(document.querySelectorAll('.custom-leaflet-marker')).map(el => el.textContent?.trim());
      const poly = mm.polylinesState.get('planned-route');

      return {
        hasPointA: Boolean(rp.pointA),
        hasPointB: Boolean(rp.pointB),
        pointAPos: rp.pointA ? rp.pointA.position : null,
        pointBPos: rp.pointB ? rp.pointB.position : null,
        startInput: document.getElementById('start-input')?.value,
        finishInput: document.getElementById('finish-input')?.value,
        mapMarkersCount: mm.markersState.size,
        adapterMarkersCount: mm.activeAdapter?.markers?.size,
        domMarkerCount: domMarkers.length,
        domMarkerLabels: domMarkers,
        polylineCount: mm.polylinesState.size,
        adapterPolylineCount: mm.activeAdapter?.polylines?.size,
        polyPoints: poly ? poly.points : null,
        hudHidden: hud ? hud.classList.contains('hidden') : true,
        hudDistance: distEl ? distEl.innerText : null,
        hudBadge: badgeEl ? badgeEl.innerText : null,
        currentRequestId: app.currentRouteRequestId
      };
    });

    // Oracle Calculation: What should the final distance be?
    let expectedDistance = null;
    let distanceMatches = false;
    let endpointsMatch = false;

    if (finalState.pointAPos && finalState.pointBPos) {
      expectedDistance = calculateMockRouteDistance(finalState.pointAPos, finalState.pointBPos);
      const actualDistNum = parseFloat(finalState.hudDistance);
      distanceMatches = Math.abs(actualDistNum - expectedDistance) < 0.05;

      if (finalState.polyPoints && finalState.polyPoints.length >= 2) {
        const firstPt = finalState.polyPoints[0];
        const lastPt = finalState.polyPoints[finalState.polyPoints.length - 1];
        // Polyline starts at Point A and ends at Point B
        const dStart = haversineDistanceKm(firstPt, finalState.pointAPos);
        const dFinish = haversineDistanceKm(lastPt, finalState.pointBPos);
        endpointsMatch = dStart < 0.05 && dFinish < 0.05;
      }
    }

    const zeroOrphanedMarkers = finalState.mapMarkersCount === 2 &&
                               finalState.adapterMarkersCount === 2 &&
                               finalState.domMarkerCount === 2;

    const zeroMismatchedReadings = distanceMatches && !finalState.hudHidden;
    const polylineConsistent = finalState.polylineCount === 1 &&
                              finalState.adapterPolylineCount === 1 &&
                              endpointsMatch;

    const allPassed = zeroOrphanedMarkers &&
                      zeroMismatchedReadings &&
                      polylineConsistent &&
                      consoleErrors.length === 0;

    record('Suite 1', 'C1.1', '20 Interleaved Operations Map/HUD/Marker Consistency', allPassed ? 'PASS' : 'FAIL', {
      totalBurstDurationMs,
      actionsDispatched: actionLog.length,
      osrmRequestsFired: netMock.getOsrmCount(),
      reverseGeocodesFired: netMock.getReverseCount(),
      finalState,
      oracle: {
        expectedDistance,
        hudDistance: finalState.hudDistance,
        distanceMatches,
        endpointsMatch
      },
      verification: {
        zeroOrphanedMarkers,
        zeroMismatchedReadings,
        polylineConsistent
      },
      consoleErrors
    });

    await page.close();
  }

  // ===========================================================================
  // TEST SUITE 2: 20 ACTIONS ENDING ON RESET WITH IN-FLIGHT LATENCY
  // ===========================================================================
  console.log('\n>>> TEST SUITE 2: 20 ACTIONS ENDING ON RESET WITH IN-FLIGHT LATENCY');
  {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(e.stack || e.message));

    const netMock = await setupThrottledNetworkMocks(page, {
      minLatency: 200,
      maxLatency: 750,
      outOfOrder: true
    });

    await page.goto(BASE_URL);
    await page.waitForFunction(() => window.garminApp && window.garminApp.mapManager && window.garminApp.mapManager.activeAdapter?.map);
    const mapBox = await page.locator('#map-container').boundingBox();
    const swapBtn = page.locator('#swap-points-btn');
    const resetBtn = page.locator('#reset-route-btn');

    // Fire 19 operations setting up routes, dragging, swapping, and end with Action 20: RESET
    await page.mouse.click(mapBox.x + 300, mapBox.y + 180); // 1
    await page.waitForTimeout(30);
    await page.mouse.click(mapBox.x + 500, mapBox.y + 280); // 2
    await page.waitForTimeout(30);
    await swapBtn.click({ force: true }); // 3
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'start', 30, 20); // 4
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'finish', -20, 30); // 5
    await page.waitForTimeout(30);
    await swapBtn.click({ force: true }); // 6
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'start', -40, -20); // 7
    await page.waitForTimeout(30);
    await swapBtn.click({ force: true }); // 8
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'finish', 35, -25); // 9
    await page.waitForTimeout(30);
    await swapBtn.click({ force: true }); // 10
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'start', 25, 35); // 11
    await page.waitForTimeout(30);
    await swapBtn.click({ force: true }); // 12
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'finish', -30, 15); // 13
    await page.waitForTimeout(30);
    await swapBtn.click({ force: true }); // 14
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'start', 15, -30); // 15
    await page.waitForTimeout(30);
    await swapBtn.click({ force: true }); // 16
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'finish', 20, 20); // 17
    await page.waitForTimeout(30);
    await swapBtn.click({ force: true }); // 18
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'start', -20, -10); // 19
    await page.waitForTimeout(25);

    // Action 20: RESET while 5+ route requests are delayed and still in transit!
    await resetBtn.click({ force: true }); // 20

    // Wait 1500ms for all delayed network responses to resolve
    await page.waitForTimeout(1500);

    const postResetState = await page.evaluate(() => {
      const app = window.garminApp;
      const mm = app.mapManager;
      const rp = app.routePlanner;
      const hud = document.getElementById('route-hud');
      const distEl = document.getElementById('hud-distance');
      const domMarkers = document.querySelectorAll('.custom-leaflet-marker');

      return {
        pointA: rp.pointA,
        pointB: rp.pointB,
        startVal: document.getElementById('start-input')?.value,
        finishVal: document.getElementById('finish-input')?.value,
        markersInState: mm.markersState.size,
        adapterMarkers: mm.activeAdapter?.markers?.size,
        domMarkerCount: domMarkers.length,
        polylinesInState: mm.polylinesState.size,
        adapterPolylines: mm.activeAdapter?.polylines?.size,
        hudHidden: hud ? hud.classList.contains('hidden') : true,
        hudDistance: distEl ? distEl.innerText : null
      };
    });

    const isCompletelyClean = postResetState.pointA === null &&
                             postResetState.pointB === null &&
                             postResetState.startVal === '' &&
                             postResetState.finishVal === '' &&
                             postResetState.markersInState === 0 &&
                             postResetState.adapterMarkers === 0 &&
                             postResetState.domMarkerCount === 0 &&
                             postResetState.polylinesInState === 0 &&
                             postResetState.adapterPolylines === 0 &&
                             postResetState.hudHidden &&
                             (postResetState.hudDistance === '--' || postResetState.hudDistance === null) &&
                             consoleErrors.length === 0;

    record('Suite 2', 'C2.1', '20 Actions Ending in Reset: Zero Orphaned Markers or Ghost Polylines', isCompletelyClean ? 'PASS' : 'FAIL', {
      actionsDispatched: 20,
      osrmRequestsFired: netMock.getOsrmCount(),
      postResetState,
      isCompletelyClean,
      consoleErrors
    });

    await page.close();
  }

  // ===========================================================================
  // TEST SUITE 3: CONCURRENCY UNDER NETWORK FAULT INJECTION (500s & DROPS)
  // ===========================================================================
  console.log('\n>>> TEST SUITE 3: CONCURRENCY UNDER NETWORK FAULT INJECTION (500s & DROPS)');
  {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(e.stack || e.message));

    const netMock = await setupThrottledNetworkMocks(page, {
      minLatency: 100,
      maxLatency: 500,
      injectFailures: true, // Injects HTTP 500 and connection drops intermittently
      outOfOrder: true
    });

    await page.goto(BASE_URL);
    await page.waitForFunction(() => window.garminApp && window.garminApp.mapManager && window.garminApp.mapManager.activeAdapter?.map);
    const mapBox = await page.locator('#map-container').boundingBox();
    const swapBtn = page.locator('#swap-points-btn');
    const resetBtn = page.locator('#reset-route-btn');

    // 20 interleaved actions with network faults
    await page.mouse.click(mapBox.x + 360, mapBox.y + 160); // 1
    await page.waitForTimeout(30);
    await page.mouse.click(mapBox.x + 560, mapBox.y + 260); // 2
    await page.waitForTimeout(30);
    await swapBtn.click({ force: true }); // 3
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'start', 30, 20); // 4
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'finish', -20, 30); // 5
    await page.waitForTimeout(30);
    await swapBtn.click({ force: true }); // 6
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'start', 40, -10); // 7
    await page.waitForTimeout(30);
    await swapBtn.click({ force: true }); // 8
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'finish', -30, -30); // 9
    await page.waitForTimeout(30);
    await resetBtn.click({ force: true }); // 10
    await page.waitForTimeout(40);

    await page.mouse.click(mapBox.x + 420, mapBox.y + 190); // 11
    await page.waitForTimeout(30);
    await page.mouse.click(mapBox.x + 620, mapBox.y + 290); // 12
    await page.waitForTimeout(30);
    await swapBtn.click({ force: true }); // 13
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'start', 25, 25); // 14
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'finish', -25, -25); // 15
    await page.waitForTimeout(30);
    await swapBtn.click({ force: true }); // 16
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'start', -30, 15); // 17
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'finish', 30, -15); // 18
    await page.waitForTimeout(30);
    await swapBtn.click({ force: true }); // 19
    await page.waitForTimeout(30);
    await dragMarkerById(page, 'start', 15, 15); // 20

    // Wait for all requests and fallbacks to settle
    await page.waitForTimeout(1500);

    const faultState = await page.evaluate(() => {
      const app = window.garminApp;
      const mm = app.mapManager;
      const rp = app.routePlanner;
      const hud = document.getElementById('route-hud');
      const distEl = document.getElementById('hud-distance');
      const badgeEl = document.getElementById('hud-source-badge');
      const poly = mm.polylinesState.get('planned-route');

      return {
        hasPointA: Boolean(rp.pointA),
        hasPointB: Boolean(rp.pointB),
        markersCount: mm.markersState.size,
        domMarkerCount: document.querySelectorAll('.custom-leaflet-marker').length,
        polylinesCount: mm.polylinesState.size,
        polyPointsCount: poly ? poly.points.length : 0,
        hudHidden: hud ? hud.classList.contains('hidden') : true,
        hudDistance: distEl ? distEl.innerText : null,
        hudBadge: badgeEl ? badgeEl.innerText : null
      };
    });

    const validDistance = faultState.hudDistance && !isNaN(parseFloat(faultState.hudDistance)) && parseFloat(faultState.hudDistance) > 0;
    const resilientlyResolved = faultState.hasPointA &&
                               faultState.hasPointB &&
                               faultState.markersCount === 2 &&
                               faultState.domMarkerCount === 2 &&
                               faultState.polylinesCount === 1 &&
                               faultState.polyPointsCount >= 2 &&
                               !faultState.hudHidden &&
                               validDistance;

    record('Suite 3', 'C3.1', '20 Interleaved Actions with Fault Injection & Fallback Transition', resilientlyResolved ? 'PASS' : 'FAIL', {
      osrmRequestsFired: netMock.getOsrmCount(),
      faultState,
      resilientlyResolved
    });

    await page.close();
  }

  // ===========================================================================
  // TEST SUITE 4: MULTI-CYCLE BURST STRESS (5 CYCLES X 20 ACTIONS = 100 OPS)
  // ===========================================================================
  console.log('\n>>> TEST SUITE 4: MULTI-CYCLE BURST STRESS (5 CYCLES X 20 ACTIONS = 100 OPS)');
  {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(e.stack || e.message));

    await setupThrottledNetworkMocks(page, {
      minLatency: 100,
      maxLatency: 400,
      outOfOrder: true
    });

    await page.goto(BASE_URL);
    await page.waitForFunction(() => window.garminApp && window.garminApp.mapManager && window.garminApp.mapManager.activeAdapter?.map);
    const mapBox = await page.locator('#map-container').boundingBox();
    const swapBtn = page.locator('#swap-points-btn');
    const resetBtn = page.locator('#reset-route-btn');

    const cycleResults = [];

    for (let cycle = 1; cycle <= 5; cycle++) {
      // 20 interleaved actions per cycle
      await page.mouse.click(mapBox.x + 300 + cycle * 15, mapBox.y + 150 + cycle * 12); // 1
      await page.waitForTimeout(25);
      await page.mouse.click(mapBox.x + 500 + cycle * 15, mapBox.y + 250 + cycle * 12); // 2
      await page.waitForTimeout(25);
      await swapBtn.click({ force: true }); // 3
      await page.waitForTimeout(25);
      await dragMarkerById(page, 'start', 25, 20); // 4
      await page.waitForTimeout(25);
      await dragMarkerById(page, 'finish', -20, 25); // 5
      await page.waitForTimeout(25);
      await swapBtn.click({ force: true }); // 6
      await page.waitForTimeout(25);
      await dragMarkerById(page, 'start', -15, 10); // 7
      await page.waitForTimeout(25);
      await swapBtn.click({ force: true }); // 8
      await page.waitForTimeout(25);
      await dragMarkerById(page, 'finish', 20, -15); // 9
      await page.waitForTimeout(25);
      await resetBtn.click({ force: true }); // 10
      await page.waitForTimeout(35);

      await page.mouse.click(mapBox.x + 350 + cycle * 8, mapBox.y + 180 + cycle * 8); // 11
      await page.waitForTimeout(25);
      await page.mouse.click(mapBox.x + 550 + cycle * 8, mapBox.y + 280 + cycle * 8); // 12
      await page.waitForTimeout(25);
      await swapBtn.click({ force: true }); // 13
      await page.waitForTimeout(25);
      await dragMarkerById(page, 'start', 30, -20); // 14
      await page.waitForTimeout(25);
      await dragMarkerById(page, 'finish', -25, 30); // 15
      await page.waitForTimeout(25);
      await swapBtn.click({ force: true }); // 16
      await page.waitForTimeout(25);
      await dragMarkerById(page, 'start', 20, 20); // 17
      await page.waitForTimeout(25);
      await dragMarkerById(page, 'finish', -20, -20); // 18
      await page.waitForTimeout(25);
      await swapBtn.click({ force: true }); // 19
      await page.waitForTimeout(25);
      await dragMarkerById(page, 'start', -10, 15); // 20

      await page.waitForTimeout(900);

      const cycleState = await page.evaluate(() => {
        const app = window.garminApp;
        const mm = app.mapManager;
        const hud = document.getElementById('route-hud');
        const distEl = document.getElementById('hud-distance');
        return {
          markersCount: mm.markersState.size,
          domMarkerCount: document.querySelectorAll('.custom-leaflet-marker').length,
          polylinesCount: mm.polylinesState.size,
          hudHidden: hud ? hud.classList.contains('hidden') : true,
          hudDistance: distEl ? distEl.innerText : null
        };
      });

      const cyclePassed = cycleState.markersCount === 2 &&
                         cycleState.domMarkerCount === 2 &&
                         cycleState.polylinesCount === 1 &&
                         !cycleState.hudHidden &&
                         parseFloat(cycleState.hudDistance) > 0;

      cycleResults.push({ cycle, cyclePassed, cycleState });

      // Reset before next cycle (except last)
      if (cycle < 5) {
        await resetBtn.click({ force: true });
        await page.waitForTimeout(100);
      }
    }

    const allCyclesPassed = cycleResults.every(c => c.cyclePassed) && consoleErrors.length === 0;

    record('Suite 4', 'C4.1', '5 Repeated Burst Cycles (100 Total Interleaved Operations)', allCyclesPassed ? 'PASS' : 'FAIL', {
      cycleResults,
      allCyclesPassed,
      consoleErrors
    });

    await page.close();
  }

  await browser.close();

  console.log('\n========================================================================');
  console.log(' EMPIRICAL CONCURRENCY STRESS SUITE COMPLETE');
  const passCount = results.filter(r => r.verdict === 'PASS').length;
  const failCount = results.filter(r => r.verdict === 'FAIL').length;
  console.log(` Summary: Total Tests: ${results.length} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
  return results;
}

runConcurrencyStressSuite().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
