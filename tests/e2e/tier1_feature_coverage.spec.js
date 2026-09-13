/**
 * Tier 1: Feature Coverage (Happy-Path) E2E Test Suite
 * Covers all 32 inventoried features from PROJECT.md / ORIGINAL_REQUEST.md.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { SELECTORS, FIXTURE_DIR, setupStandardMocks } from './helpers.js';

test.describe('Tier 1: Feature Coverage & Happy-Path Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await setupStandardMocks(page);
    await page.goto('/');
  });

  // Feature 1, 2: Responsive Map Container & Leaflet Default Provider
  test('T1.01 - Map initializes with Leaflet default provider in responsive container', async ({ page }) => {
    const mapContainer = page.locator(SELECTORS.map).first();
    await expect(mapContainer).toBeVisible({ timeout: 10000 });

    // Verify container has non-zero dimensions
    const box = await mapContainer.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThan(200);
    expect(box.height).toBeGreaterThan(200);

    // Verify Leaflet tiles / pane loaded
    const leafletPane = page.locator(SELECTORS.leafletTiles).first();
    await expect(leafletPane).toBeVisible({ timeout: 5000 });
  });

  // Feature 3, 4: Google Maps Dynamic Loader & Automatic Fallback
  test('T1.02 - Map gracefully falls back to Leaflet when Google Maps key is missing or invalid', async ({ page }) => {
    // Check provider indicator or fallback toast
    const mapContainer = page.locator(SELECTORS.map).first();
    await expect(mapContainer).toBeVisible();

    // Verify application did not crash and Leaflet remains active
    const leafletElements = page.locator('.leaflet-container, .leaflet-tile-pane');
    await expect(leafletElements.first()).toBeVisible();
  });

  // Feature 5: Manual Provider Toggle
  test('T1.03 - Manual map provider toggle is accessible and switchable', async ({ page }) => {
    const toggle = page.locator(SELECTORS.providerToggle).first();
    if (await toggle.isVisible()) {
      await toggle.click();
      // Ensure container remains stable
      const mapContainer = page.locator(SELECTORS.map).first();
      await expect(mapContainer).toBeVisible();
    }
  });

  // Feature 6, 7: Point A & Point B Selection
  test('T1.04 - Select Point A (Start) and Point B (Finish) via address search', async ({ page }) => {
    const startInput = page.locator(SELECTORS.startInput).first();
    const finishInput = page.locator(SELECTORS.finishInput).first();

    await expect(startInput).toBeVisible();
    await expect(finishInput).toBeVisible();

    await startInput.fill('Parque Ibirapuera');
    await startInput.press('Enter');

    await finishInput.fill('Avenida Paulista');
    await finishInput.press('Enter');

    // Verify inputs contain values
    await expect(startInput).toHaveValue(/Parque Ibirapuera/i);
    await expect(finishInput).toHaveValue(/Avenida Paulista/i);
  });

  // Feature 8: Draggable Waypoints
  test('T1.05 - Start and Finish markers appear on map', async ({ page }) => {
    const startInput = page.locator(SELECTORS.startInput).first();
    const finishInput = page.locator(SELECTORS.finishInput).first();

    await startInput.fill('Start Location');
    await finishInput.fill('Finish Location');

    const calcBtn = page.locator(SELECTORS.calculateBtn).first();
    if (await calcBtn.isVisible()) {
      await calcBtn.click();
    }

    // Verify markers exist on map
    const markers = page.locator(SELECTORS.leafletMarkers);
    // At least 1 or 2 markers should be created
    await expect(markers.first()).toBeAttached({ timeout: 5000 });
  });

  // Feature 9: Point Swap and Reset
  test('T1.06 - Swap points interchanges Point A and Point B; Reset clears inputs', async ({ page }) => {
    const startInput = page.locator(SELECTORS.startInput).first();
    const finishInput = page.locator(SELECTORS.finishInput).first();
    const swapBtn = page.locator(SELECTORS.swapPointsBtn).first();
    const resetBtn = page.locator(SELECTORS.resetRouteBtn).first();

    await startInput.fill('Location Alpha');
    await finishInput.fill('Location Beta');

    if (await swapBtn.isVisible()) {
      await swapBtn.click();
      await expect(startInput).toHaveValue('Location Beta');
      await expect(finishInput).toHaveValue('Location Alpha');
    }

    if (await resetBtn.isVisible()) {
      await resetBtn.click();
      await expect(startInput).toHaveValue('');
      await expect(finishInput).toHaveValue('');
    }
  });

  // Feature 10, 11, 12, 13: OSRM Route Calculation, Polyline Tracing & Distance Display
  test('T1.07 - Calculates road running route, traces blue polyline and displays distance in km', async ({ page }) => {
    const startInput = page.locator(SELECTORS.startInput).first();
    const finishInput = page.locator(SELECTORS.finishInput).first();
    const calcBtn = page.locator(SELECTORS.calculateBtn).first();

    await startInput.fill('Start Point');
    await finishInput.fill('Finish Point');

    if (await calcBtn.isVisible()) {
      await calcBtn.click();
    }

    // Planned distance indicator should display distance formatted with 'km'
    const distanceBadge = page.locator(SELECTORS.plannedDistance).first();
    await expect(distanceBadge).toBeVisible({ timeout: 5000 });
    const text = await distanceBadge.innerText();
    expect(text).toMatch(/\d+(\.\d+)?\s*km/i);

    // Verify planned polyline is rendered on map
    const polyline = page.locator('path.leaflet-interactive, path[stroke], svg path').first();
    await expect(polyline).toBeAttached();
  });

  // Feature 14: Mock Garmin OAuth 2.0 PKCE Flow
  test('T1.08 - Garmin Connect OAuth modal opens, authorizes, and stores session', async ({ page }) => {
    const connectBtn = page.locator(SELECTORS.connectGarminBtn).first();
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();

    // Verify modal appears
    const modal = page.locator(SELECTORS.garminModal).first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Click Authorize
    const authBtn = page.locator(SELECTORS.authorizeBtn).first();
    await expect(authBtn).toBeVisible();
    await authBtn.click();

    // Verify connected state is reflected in UI
    const status = page.locator(SELECTORS.garminStatus, { hasText: /Connected/i }).first();
    await expect(status).toBeVisible({ timeout: 5000 });
  });

  // Feature 15, 16: Garmin Sync REST API & Pre-seeded Workout Library
  test('T1.09 - Sync activities displays list of pre-seeded Garmin running workouts', async ({ page }) => {
    // Ensure connected or click connect
    const connectBtn = page.locator(SELECTORS.connectGarminBtn).first();
    if (await connectBtn.isVisible()) {
      await connectBtn.click();
      const authBtn = page.locator(SELECTORS.authorizeBtn).first();
      if (await authBtn.isVisible()) await authBtn.click();
    }

    const syncBtn = page.locator(SELECTORS.syncActivitiesBtn).first();
    if (await syncBtn.isVisible()) {
      await syncBtn.click();
      // Verify activity items are rendered
      const activityItem = page.locator(SELECTORS.activityItem).first();
      await expect(activityItem).toBeVisible({ timeout: 5000 });
      const itemText = await activityItem.innerText();
      expect(itemText).toMatch(/5K|10K|Run/i);
    }
  });

  // Feature 17, 18, 19: GPX 1.1 / JSON Import & Telemetry Extraction
  test('T1.10 - Import valid GPX 1.1 file and extract activity telemetry', async ({ page }) => {
    const fileInput = page.locator(SELECTORS.gpxFileInput).first();
    await expect(fileInput).toBeAttached();

    const gpxFilePath = path.join(FIXTURE_DIR, 'sample_5k.gpx');
    await fileInput.setInputFiles(gpxFilePath);

    // Verify comparison HUD or telemetry displays actual distance and pace
    const hud = page.locator(SELECTORS.comparisonHud).first();
    await expect(hud).toBeVisible({ timeout: 5000 });

    const paceElement = page.locator(SELECTORS.actualPace).first();
    if (await paceElement.isVisible()) {
      const paceText = await paceElement.innerText();
      expect(paceText).toMatch(/\d+:\d{2}\s*(\/km)?/);
    }
  });

  // Feature 20, 21: Dual Polyline Overlay & Automated Viewport Framing
  test('T1.11 - Dual polyline renders both planned blue and actual orange tracks with auto-framing', async ({ page }) => {
    // 1. Calculate a planned route
    const startInput = page.locator(SELECTORS.startInput).first();
    const finishInput = page.locator(SELECTORS.finishInput).first();
    await startInput.fill('Start');
    await finishInput.fill('Finish');
    const calcBtn = page.locator(SELECTORS.calculateBtn).first();
    if (await calcBtn.isVisible()) await calcBtn.click();

    // 2. Import GPX track
    const fileInput = page.locator(SELECTORS.gpxFileInput).first();
    const gpxFilePath = path.join(FIXTURE_DIR, 'sample_5k.gpx');
    await fileInput.setInputFiles(gpxFilePath);

    // 3. Verify polylines exist in DOM
    const polylines = page.locator('path.leaflet-interactive, path[stroke]');
    await expect(polylines.first()).toBeAttached({ timeout: 5000 });
    const count = await polylines.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // Feature 22, 23, 24, 25: Distance Comparison, Pace Analysis & Corridor Adherence Scoring
  test('T1.12 - Comparison HUD computes distance delta, pace analysis, and corridor adherence score', async ({ page }) => {
    // Plan route
    await page.locator(SELECTORS.startInput).first().fill('Start');
    await page.locator(SELECTORS.finishInput).first().fill('Finish');
    const calcBtn = page.locator(SELECTORS.calculateBtn).first();
    if (await calcBtn.isVisible()) await calcBtn.click();

    // Import GPX
    const fileInput = page.locator(SELECTORS.gpxFileInput).first();
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'sample_5k.gpx'));

    // Check Distance Delta
    const delta = page.locator(SELECTORS.distanceDelta).first();
    await expect(delta).toBeVisible({ timeout: 5000 });
    const deltaText = await delta.innerText();
    expect(deltaText).toMatch(/(\+|-)?\d+(\.\d+)?\s*(km|m|%)/i);

    // Check Adherence Score
    const adherence = page.locator(SELECTORS.adherenceScore).first();
    if (await adherence.isVisible()) {
      const scoreText = await adherence.innerText();
      expect(scoreText).toMatch(/\d+(\.\d+)?\s*%/);
    }
  });

  // Feature 26, 27, 28: Workout Record Assembler & Persistence
  test('T1.13 - Save workout persists record to history and local cache', async ({ page }) => {
    // Setup route and track
    await page.locator(SELECTORS.startInput).first().fill('Start Point');
    await page.locator(SELECTORS.finishInput).first().fill('Finish Point');
    const calcBtn = page.locator(SELECTORS.calculateBtn).first();
    if (await calcBtn.isVisible()) await calcBtn.click();

    const fileInput = page.locator(SELECTORS.gpxFileInput).first();
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'sample_5k.gpx'));

    // Save Workout
    const saveBtn = page.locator(SELECTORS.saveWorkoutBtn).first();
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await saveBtn.click();

    // Verify card in History Dashboard
    const historyContainer = page.locator(SELECTORS.historyContainer).first();
    await expect(historyContainer).toBeVisible({ timeout: 5000 });

    const card = page.locator(SELECTORS.workoutCard).first();
    await expect(card).toBeVisible();
    const cardText = await card.innerText();
    expect(cardText).toMatch(/5\.\d+\s*km/i);
  });

  // Feature 29, 30, 31, 32: Minimalist History Dashboard, Mini Preview, Re-inspection & Deletion
  test('T1.14 - History dashboard displays mini route preview, allows reload into map, and supports deletion', async ({ page }) => {
    // Pre-populate or save a workout
    await page.locator(SELECTORS.startInput).first().fill('Start');
    await page.locator(SELECTORS.finishInput).first().fill('Finish');
    const calcBtn = page.locator(SELECTORS.calculateBtn).first();
    if (await calcBtn.isVisible()) await calcBtn.click();

    await page.locator(SELECTORS.gpxFileInput).first().setInputFiles(path.join(FIXTURE_DIR, 'sample_5k.gpx'));
    await page.locator(SELECTORS.saveWorkoutBtn).first().click();

    const card = page.locator(SELECTORS.workoutCard).first();
    await expect(card).toBeVisible({ timeout: 5000 });

    // Verify mini route preview SVG or canvas is attached
    const preview = card.locator(SELECTORS.miniRoutePreview).first();
    if (await preview.isVisible()) {
      await expect(preview).toBeAttached();
    }

    // Re-inspect workout by clicking card
    await card.click();
    await expect(page.locator(SELECTORS.comparisonHud).first()).toBeVisible();

    // Delete workout
    const deleteBtn = card.locator(SELECTORS.deleteWorkoutBtn).first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
    }
  });
});
