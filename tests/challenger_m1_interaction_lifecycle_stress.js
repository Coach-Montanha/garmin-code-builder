/**
 * tests/challenger_m1_interaction_lifecycle_stress.js
 * Empirical Challenger Verification Harness for Milestone 1:
 * Multi-cycle rapid interaction bursts (5 bursts x 20 rapid operations = 100 operations)
 * testing Leaflet pointer tracking, marker drag/dragend, click dropping, swap, reset,
 * and 100% map interactivity with zero console errors and zero uncaught exceptions.
 */

import { chromium } from '@playwright/test';
import { performance } from 'perf_hooks';
import fs from 'fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function calculateStats(latencies) {
  if (latencies.length === 0) return { min: 0, max: 0, mean: 0, p95: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = Number(sorted[0].toFixed(2));
  const max = Number(sorted[sorted.length - 1].toFixed(2));
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = Number((sum / sorted.length).toFixed(2));
  const p95Idx = Math.floor(sorted.length * 0.95);
  const p95 = Number(sorted[p95Idx].toFixed(2));
  return { min, max, mean, p95 };
}

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

async function setupNetworkMocks(page) {
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

  await page.route(/photon\.komoot\.io\/reverse/, async (route) => {
    await new Promise(r => setTimeout(r, 20));
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          features: [{
            properties: { name: 'Rua Augusta, 100', city: 'São Paulo' }
          }]
        })
      });
    } catch (e) {}
  });

  await page.route(/router\.project-osrm\.org\/route\/v1\/foot\/(.*)/, async (route) => {
    const url = route.request().url();
    const match = url.match(/foot\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/);
    let start = { lat: -23.5505, lng: -46.6333 };
    let finish = { lat: -23.5580, lng: -46.6400 };
    if (match) {
      start = { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
      finish = { lng: parseFloat(match[3]), lat: parseFloat(match[4]) };
    }

    const distKm = haversineDistanceKm(start, finish) * 1.28;
    const durSec = Math.round((distKm / 10) * 3600);

    const coordinates = [];
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      coordinates.push([
        Number((start.lng + (finish.lng - start.lng) * frac).toFixed(6)),
        Number((start.lat + (finish.lat - start.lat) * frac).toFixed(6))
      ]);
    }

    await new Promise(r => setTimeout(r, 35));

    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'Ok',
          routes: [{
            geometry: {
              type: 'LineString',
              coordinates: coordinates
            },
            legs: [{
              steps: [],
              distance: distKm * 1000,
              duration: durSec
            }],
            distance: distKm * 1000,
            duration: durSec
          }],
          waypoints: [
            { name: 'Start', location: [start.lng, start.lat] },
            { name: 'Finish', location: [finish.lng, finish.lat] }
          ]
        })
      });
    } catch (e) {}
  });
}

async function dragMarker(page, markerId, deltaX, deltaY, steps = 3) {
  const markerBox = await page.evaluate((id) => {
    const el = window.garminApp.mapManager.activeAdapter.markers.get(id)?.getElement();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }, markerId);

  if (!markerBox) {
    throw new Error('Marker ' + markerId + ' element not found in DOM');
  }

  const startX = markerBox.x + markerBox.width / 2;
  const startY = markerBox.y + markerBox.height / 2;
  const targetX = startX + deltaX;
  const targetY = startY + deltaY;

  const t0 = performance.now();
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps });
  await page.mouse.up();
  const latency = performance.now() - t0;

  return latency;
}

export async function runEmpiricalLifecycleStress() {
  console.log('========================================================================');
  console.log(' EMPIRICAL CHALLENGER: MILESTONE 1 UI & INTERACTION LIFECYCLE STRESS');
  console.log(' 5 Multi-Cycle Bursts of 20 Rapid Operations (Total 100 Operations)');
  console.log('========================================================================\n');

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();

  const consoleErrors = [];
  const uncaughtExceptions = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    uncaughtExceptions.push({ message: err.message, stack: err.stack });
  });

  await setupNetworkMocks(page);

  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.garminApp && window.garminApp.mapManager && window.garminApp.mapManager.activeAdapter?.map);

  await page.evaluate(() => {
    window.__challengerSpies = {
      leafletClickCount: 0,
      mapClicksReceived: []
    };

    const map = window.garminApp.mapManager.activeAdapter.map;
    map.on('click', (e) => {
      window.__challengerSpies.leafletClickCount++;
      window.__challengerSpies.mapClicksReceived.push({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
  });

  const mapBox = await page.locator('#map-container').boundingBox();
  const swapBtn = page.locator('#swap-points-btn');
  const resetBtn = page.locator('#reset-route-btn');

  const burstsReport = [];
  let totalDispatchedClicks = 0;
  const allOperationLatencies = [];
  const latencyByOpType = { click: [], drag: [], swap: [], reset: [] };

  for (let burstIdx = 1; burstIdx <= 5; burstIdx++) {
    console.log('--- Starting Burst ' + burstIdx + '/5 (20 Rapid Operations) ---');
    const burstT0 = performance.now();
    const burstOperations = [];

    // Clearly in open map area (planner card ends at ~396px from left)
    const anchorAx = mapBox.x + 450 + (burstIdx * 15);
    const anchorAy = mapBox.y + 160 + (burstIdx * 12);
    const anchorBx = mapBox.x + 680 + (burstIdx * 12);
    const anchorBy = mapBox.y + 280 + (burstIdx * 10);

    const anchorA2x = mapBox.x + 470 + (burstIdx * 10);
    const anchorA2y = mapBox.y + 190 + (burstIdx * 10);
    const anchorB2x = mapBox.x + 650 + (burstIdx * 10);
    const anchorB2y = mapBox.y + 260 + (burstIdx * 8);

    const operationsPlan = [
      { id: 1, type: 'click', name: 'Click A (Set Start)', run: async () => {
        totalDispatchedClicks++;
        await page.mouse.click(anchorAx, anchorAy);
      }},
      { id: 2, type: 'click', name: 'Click B (Set Finish)', run: async () => {
        totalDispatchedClicks++;
        await page.mouse.click(anchorBx, anchorBy);
      }},
      { id: 3, type: 'drag', name: 'Drag A (+30, +25)', run: async () => {
        return await dragMarker(page, 'start', 30, 25);
      }},
      { id: 4, type: 'drag', name: 'Drag B (-25, +30)', run: async () => {
        return await dragMarker(page, 'finish', -25, 30);
      }},
      { id: 5, type: 'swap', name: 'Swap (A <-> B)', run: async () => {
        await swapBtn.click({ force: true });
      }},
      { id: 6, type: 'drag', name: 'Drag A (+20, -20)', run: async () => {
        return await dragMarker(page, 'start', 20, -20);
      }},
      { id: 7, type: 'drag', name: 'Drag B (-20, -15)', run: async () => {
        return await dragMarker(page, 'finish', -20, -15);
      }},
      { id: 8, type: 'swap', name: 'Swap (A <-> B)', run: async () => {
        await swapBtn.click({ force: true });
      }},
      { id: 9, type: 'drag', name: 'Drag A (+15, +15)', run: async () => {
        return await dragMarker(page, 'start', 15, 15);
      }},
      { id: 10, type: 'reset', name: 'Reset Route & Markers', run: async () => {
        await resetBtn.click({ force: true });
      }},
      { id: 11, type: 'click', name: 'Click A post-Reset (Re-arm Start)', run: async () => {
        totalDispatchedClicks++;
        await page.mouse.click(anchorA2x, anchorA2y);
      }},
      { id: 12, type: 'click', name: 'Click B post-Reset (Re-arm Finish)', run: async () => {
        totalDispatchedClicks++;
        await page.mouse.click(anchorB2x, anchorB2y);
      }},
      { id: 13, type: 'drag', name: 'Drag A (-25, +20)', run: async () => {
        return await dragMarker(page, 'start', -25, 20);
      }},
      { id: 14, type: 'drag', name: 'Drag B (+25, -25)', run: async () => {
        return await dragMarker(page, 'finish', 25, -25);
      }},
      { id: 15, type: 'swap', name: 'Swap (A <-> B)', run: async () => {
        await swapBtn.click({ force: true });
      }},
      { id: 16, type: 'drag', name: 'Drag A (+15, +25)', run: async () => {
        return await dragMarker(page, 'start', 15, 25);
      }},
      { id: 17, type: 'drag', name: 'Drag B (-20, -20)', run: async () => {
        return await dragMarker(page, 'finish', -20, -20);
      }},
      { id: 18, type: 'swap', name: 'Swap (A <-> B)', run: async () => {
        await swapBtn.click({ force: true });
      }},
      { id: 19, type: 'drag', name: 'Drag A (-15, -15)', run: async () => {
        return await dragMarker(page, 'start', -15, -15);
      }},
      { id: 20, type: 'drag', name: 'Drag B (+20, +20)', run: async () => {
        return await dragMarker(page, 'finish', 20, 20);
      }}
    ];

    for (const op of operationsPlan) {
      const opT0 = performance.now();
      let customLatency = null;
      let opSuccess = true;
      let opError = null;

      try {
        const ret = await op.run();
        if (typeof ret === 'number') customLatency = ret;
      } catch (err) {
        opSuccess = false;
        opError = err.message;
      }

      const opLatency = customLatency || (performance.now() - opT0);
      allOperationLatencies.push(opLatency);
      latencyByOpType[op.type].push(opLatency);

      burstOperations.push({
        id: op.id,
        name: op.name,
        type: op.type,
        latencyMs: Number(opLatency.toFixed(2)),
        success: opSuccess,
        error: opError
      });

      await page.waitForTimeout(30);
    }

    const burstDurationMs = performance.now() - burstT0;
    await page.waitForTimeout(600);

    const pointerIntegrity = await page.evaluate(() => {
      const app = window.garminApp;
      const mm = app.mapManager;
      const adapter = mm.activeAdapter;
      const map = adapter.map;
      const startMarker = adapter.markers.get('start');
      const finishMarker = adapter.markers.get('finish');

      const isMapDraggingMoving = map.dragging ? map.dragging.moving() : false;
      const isStartDraggableMoving = (startMarker && startMarker.dragging && startMarker.dragging._draggable) ? Boolean(startMarker.dragging._draggable._moving) : false;
      const isFinishDraggableMoving = (finishMarker && finishMarker.dragging && finishMarker.dragging._draggable) ? Boolean(finishMarker.dragging._draggable._moving) : false;
      const mapContainer = document.getElementById('map-container');
      const mapPointerEvents = window.getComputedStyle(mapContainer).pointerEvents;

      return {
        isMapDraggingMoving,
        isStartDraggableMoving,
        isFinishDraggableMoving,
        mapPointerEvents,
        cleanPointerState: !isMapDraggingMoving && !isStartDraggableMoving && !isFinishDraggableMoving && mapPointerEvents !== 'none'
      };
    });

    const panTest = await page.evaluate(async () => {
      const map = window.garminApp.mapManager.activeAdapter.map;
      const initialCenter = map.getCenter();
      map.panBy([100, 50], { animate: false });
      const newCenter = map.getCenter();
      const didPan = (Math.abs(newCenter.lat - initialCenter.lat) > 0.0001) || (Math.abs(newCenter.lng - initialCenter.lng) > 0.0001);
      map.panTo(initialCenter, { animate: false });
      return { didPan, initialCenter, newCenter };
    });

    const zoomTest = await page.evaluate(async () => {
      const map = window.garminApp.mapManager.activeAdapter.map;
      const initialZoom = map.getZoom();
      map.setZoom(initialZoom + 1, { animate: false });
      const zoomedIn = map.getZoom() === initialZoom + 1;
      map.setZoom(initialZoom, { animate: false });
      return { zoomedIn, initialZoom };
    });

    const clickSpyBefore = await page.evaluate(() => window.__challengerSpies.leafletClickCount);
    const testClickX = mapBox.x + 550;
    const testClickY = mapBox.y + 220;
    await page.mouse.click(testClickX, testClickY);
    totalDispatchedClicks++;
    await page.waitForTimeout(50);
    const clickSpyAfter = await page.evaluate(() => window.__challengerSpies.leafletClickCount);
    const mapClickReceived = (clickSpyAfter > clickSpyBefore);

    const postBurstState = await page.evaluate(() => {
      const app = window.garminApp;
      const mm = app.mapManager;
      const rp = app.routePlanner;
      const hud = document.getElementById('route-hud');
      const distEl = document.getElementById('hud-distance');
      const domMarkers = document.querySelectorAll('.custom-leaflet-marker');
      const poly = mm.polylinesState.get('planned-route');

      return {
        hasPointA: Boolean(rp.pointA),
        hasPointB: Boolean(rp.pointB),
        startMarkerInAdapter: Boolean(mm.activeAdapter.markers.get('start')),
        finishMarkerInAdapter: Boolean(mm.activeAdapter.markers.get('finish')),
        domMarkerCount: domMarkers.length,
        polylinesCount: mm.polylinesState.size,
        polyPointsCount: poly ? poly.points.length : 0,
        hudHidden: hud ? hud.classList.contains('hidden') : true,
        hudDistance: distEl ? distEl.innerText : null
      };
    });

    const burstLatencies = burstOperations.map(o => o.latencyMs);
    const burstStats = calculateStats(burstLatencies);

    const burstAllOpsSuccess = burstOperations.every(o => o.success);
    const burstInteractivityPass = pointerIntegrity.cleanPointerState && panTest.didPan && zoomTest.zoomedIn && mapClickReceived;
    const burstStatePass = postBurstState.hasPointA && postBurstState.hasPointB &&
                           postBurstState.startMarkerInAdapter && postBurstState.finishMarkerInAdapter &&
                           postBurstState.domMarkerCount === 2 && postBurstState.polylinesCount === 1 &&
                           !postBurstState.hudHidden && parseFloat(postBurstState.hudDistance) > 0;

    const burstPass = burstAllOpsSuccess && burstInteractivityPass && burstStatePass;

    burstsReport.push({
      burstIndex: burstIdx,
      operationsCount: burstOperations.length,
      durationMs: Number(burstDurationMs.toFixed(2)),
      latencyStats: burstStats,
      pointerIntegrity,
      panTest,
      zoomTest,
      mapClickReceived,
      postBurstState,
      burstPass,
      operations: burstOperations
    });

    console.log('Burst ' + burstIdx + ' Complete in ' + burstDurationMs.toFixed(1) + 'ms | Mean Op: ' + burstStats.mean + 'ms | Map Interactivity: ' + (burstInteractivityPass ? 'PASS' : 'FAIL') + ' | Verdict: ' + (burstPass ? 'PASS' : 'FAIL'));

    if (burstIdx < 5) {
      await resetBtn.click({ force: true });
      await page.waitForTimeout(100);
    }
  }

  const finalClickSpies = await page.evaluate(() => window.__challengerSpies);
  const totalLeafletClicks = finalClickSpies.leafletClickCount;

  await resetBtn.click({ force: true });
  await page.waitForTimeout(200);

  const finalCleanState = await page.evaluate(() => {
    const app = window.garminApp;
    const mm = app.mapManager;
    const rp = app.routePlanner;
    const hud = document.getElementById('route-hud');
    const domMarkers = document.querySelectorAll('.custom-leaflet-marker');

    return {
      pointA: rp.pointA,
      pointB: rp.pointB,
      markersCount: mm.markersState.size,
      adapterMarkers: mm.activeAdapter?.markers?.size,
      domMarkerCount: domMarkers.length,
      polylinesCount: mm.polylinesState.size,
      hudHidden: hud ? hud.classList.contains('hidden') : true
    };
  });

  await browser.close();

  const overallStats = calculateStats(allOperationLatencies);
  const clickStats = calculateStats(latencyByOpType.click);
  const dragStats = calculateStats(latencyByOpType.drag);
  const swapStats = calculateStats(latencyByOpType.swap);
  const resetStats = calculateStats(latencyByOpType.reset);

  const allBurstsPassed = burstsReport.every(b => b.burstPass);
  const zeroConsoleErrors = consoleErrors.length === 0;
  const zeroUncaughtExceptions = uncaughtExceptions.length === 0;
  const finalClean = finalCleanState.pointA === null && finalCleanState.pointB === null &&
                     finalCleanState.markersCount === 0 && finalCleanState.adapterMarkers === 0 &&
                     finalCleanState.domMarkerCount === 0 && finalCleanState.polylinesCount === 0;

  const finalVerdict = (allBurstsPassed && zeroConsoleErrors && zeroUncaughtExceptions && finalClean) ? 'PASS' : 'FAIL';

  const fullReport = {
    verdict: finalVerdict,
    summary: {
      totalBursts: 5,
      totalOperations: 100,
      burstsPassed: burstsReport.filter(b => b.burstPass).length,
      zeroConsoleErrors,
      consoleErrorCount: consoleErrors.length,
      consoleErrors,
      zeroUncaughtExceptions,
      uncaughtExceptionCount: uncaughtExceptions.length,
      uncaughtExceptions,
      mapInteractivityScore: allBurstsPassed ? '100%' : 'DEGRADED',
      totalDispatchedClicks,
      totalLeafletClicksReceived: totalLeafletClicks,
      finalClean
    },
    latencyMetrics: {
      overall: overallStats,
      byType: {
        click: clickStats,
        drag: dragStats,
        swap: swapStats,
        reset: resetStats
      }
    },
    bursts: burstsReport,
    finalCleanState
  };

  console.log('\n========================================================================');
  console.log(' EMPIRICAL STRESS TEST SUITE VERDICT: ' + finalVerdict);
  console.log('========================================================================');
  console.log(' Bursts Passed: ' + fullReport.summary.burstsPassed + '/5');
  console.log(' Total Rapid Operations: ' + fullReport.summary.totalOperations);
  console.log(' Zero Console Errors: ' + (zeroConsoleErrors ? 'YES (0 errors)' : 'NO (' + consoleErrors.length + ' errors)'));
  console.log(' Zero Uncaught Exceptions: ' + (zeroUncaughtExceptions ? 'YES (0 exceptions)' : 'NO (' + uncaughtExceptions.length + ' exceptions)'));
  console.log(' Map Interactivity: ' + fullReport.summary.mapInteractivityScore);
  console.log(' Mean Operation Latency: ' + overallStats.mean + 'ms (p95: ' + overallStats.p95 + 'ms)');
  console.log(' Drag Operation Mean Latency: ' + dragStats.mean + 'ms (p95: ' + dragStats.p95 + 'ms)');
  console.log(' Total Dispatched Clicks: ' + totalDispatchedClicks + ' | Leaflet Received: ' + totalLeafletClicks);
  console.log('========================================================================\n');

  fs.writeFileSync('tests/challenger_stress_results.json', JSON.stringify(fullReport, null, 2), 'utf8');

  return fullReport;
}

runEmpiricalLifecycleStress().then(report => {
  if (report.verdict === 'PASS') {
    process.exit(0);
  } else {
    process.exit(1);
  }
}).catch(err => {
  console.error('Fatal stress suite execution failure:', err);
  process.exit(1);
});