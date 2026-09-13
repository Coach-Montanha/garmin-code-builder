/**
 * tests/reproduce_dragend_concurrency_defect.js
 * Empirical Challenger Reproduction Harness for Milestone 1 DragEnd TypeError.
 * 
 * Verifies the exact defect:
 * LeafletAdapter line 175 accesses `e.latlng.lat`, but Leaflet's `dragend` event
 * object does not contain `latlng` property.
 */

import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

export async function reproduceDefect() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', err => errors.push({ message: err.message, stack: err.stack }));

  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.garminApp && window.garminApp.mapManager?.activeAdapter?.map);

  const mapBox = await page.locator('#map-container').boundingBox();

  // Place Point A
  await page.mouse.click(mapBox.x + 400, mapBox.y + 200);
  await page.waitForTimeout(200);

  // Inspect Leaflet dragend event signature directly in browser context
  const inspectResult = await page.evaluate(() => {
    const app = window.garminApp;
    const marker = app.mapManager.activeAdapter.markers.get('start');
    if (!marker) return { error: 'marker start not found' };

    let eventCaptured = null;
    marker.on('dragend', (evt) => {
      eventCaptured = {
        hasLatLng: 'latlng' in evt,
        latlngValue: evt.latlng,
        hasTarget: 'target' in evt,
        targetHasGetLatLng: typeof evt.target?.getLatLng === 'function',
        correctLatLng: evt.target?.getLatLng() ? {
          lat: evt.target.getLatLng().lat,
          lng: evt.target.getLatLng().lng
        } : null
      };
    });

    return { registered: true };
  });

  // Perform physical drag gesture on start marker
  const markerBox = await page.evaluate(() => {
    const el = window.garminApp.mapManager.activeAdapter.markers.get('start')?.getElement();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });

  if (markerBox) {
    await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(markerBox.x + markerBox.width / 2 + 50, markerBox.y + markerBox.height / 2 + 50, { steps: 3 });
    await page.mouse.up();
  }

  await page.waitForTimeout(400);

  const capturedDefect = errors.find(e => e.message.includes("Cannot read properties of undefined (reading 'lat')"));

  console.log('========================================================================');
  console.log(' EMPIRICAL DEFECT REPRODUCTION RESULT');
  console.log('========================================================================');
  console.log('Total Page Errors Captured:', errors.length);
  if (capturedDefect) {
    console.log('🚨 DEFECT REPRODUCED 100% EMPIRICALLY:');
    console.log('   Message:', capturedDefect.message);
    console.log('   Stack Trace:\n', capturedDefect.stack);
  } else {
    console.log('No TypeError captured.');
  }
  console.log('========================================================================');

  await browser.close();
  return { errors, defectFound: Boolean(capturedDefect) };
}

reproduceDefect().then(res => {
  if (res.defectFound) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}).catch(err => {
  console.error('Fatal reproduction error:', err);
  process.exit(1);
});
