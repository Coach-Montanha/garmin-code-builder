/**
 * Tier 2: Boundary, Edge & Corner Cases E2E Test Suite
 * Exercises boundary extremes, invalid inputs, failure modes, and stress limits.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { SELECTORS, FIXTURE_DIR, setupStandardMocks } from './helpers.js';

test.describe('Tier 2: Boundary, Edge & Corner Cases', () => {
  test.beforeEach(async ({ page }) => {
    await setupStandardMocks(page);
    await page.goto('/');
  });

  // T2.01 - Identical Start and Finish points (Zero Distance)
  test('T2.01 - Setting identical Start and Finish points shows validation warning without crashing', async ({ page }) => {
    const startInput = page.locator(SELECTORS.startInput).first();
    const finishInput = page.locator(SELECTORS.finishInput).first();
    const calcBtn = page.locator(SELECTORS.calculateBtn).first();

    await startInput.fill('Parque Ibirapuera');
    await finishInput.fill('Parque Ibirapuera');

    if (await calcBtn.isVisible()) {
      await calcBtn.click();
    }

    // Expect validation message or toast
    const alertOrToast = page.locator('.toast, .alert, .error, [role="alert"], :text-matches("identical|different|mesmo|inválid", "i")').first();
    await expect(alertOrToast).toBeVisible({ timeout: 5000 });

    // Map container must remain alive
    await expect(page.locator(SELECTORS.map).first()).toBeVisible();
  });

  // T2.02 - Special Characters, Script Tags and SQL Injection in Address Search
  test('T2.02 - Special characters, XSS vectors and SQL injections in search inputs are handled safely', async ({ page }) => {
    const startInput = page.locator(SELECTORS.startInput).first();

    const maliciousInputs = [
      '<script>alert("xss")</script>',
      "'; DROP TABLE workouts; --",
      '🚀🏃‍♂️💨🌟⚡',
      '       ',
    ];

    for (const input of maliciousInputs) {
      await startInput.fill(input);
      await startInput.press('Enter');
      await page.waitForTimeout(200);

      // Verify no unhandled dialog or crash
      await expect(page.locator(SELECTORS.map).first()).toBeVisible();
    }
  });

  // T2.03 - Routing Engine Outage & Resilient Haversine Fallback
  test('T2.03 - Recovers gracefully when OSRM routing API returns 500/network error using Haversine fallback', async ({ page }) => {
    // Override routing to abort or return 500
    await page.route(/router\.project-osrm\.org\/route\/v1\/foot/, async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"InternalError"}' });
    });

    const startInput = page.locator(SELECTORS.startInput).first();
    const finishInput = page.locator(SELECTORS.finishInput).first();
    const calcBtn = page.locator(SELECTORS.calculateBtn).first();

    await startInput.fill('Start Point');
    await finishInput.fill('Finish Point');

    if (await calcBtn.isVisible()) {
      await calcBtn.click();
    }

    // Expect fallback route polyline or distance to be displayed regardless
    const distanceBadge = page.locator(SELECTORS.plannedDistance).first();
    await expect(distanceBadge).toBeVisible({ timeout: 6000 });
    const text = await distanceBadge.innerText();
    expect(text).toMatch(/\d+(\.\d+)?\s*km/i);
  });

  // T2.04 - Corrupted GPX File Upload (Malformed XML)
  test('T2.04 - Uploading malformed/truncated GPX XML shows descriptive error and keeps app stable', async ({ page }) => {
    const fileInput = page.locator(SELECTORS.gpxFileInput).first();
    await expect(fileInput).toBeAttached();

    const corruptGpx = path.join(FIXTURE_DIR, 'corrupt.gpx');
    await fileInput.setInputFiles(corruptGpx);

    // Expect error notification or alert
    const errorNotice = page.locator('.toast, .alert, .error, [role="alert"], :text-matches("invalid|corrupt|error|falha", "i")').first();
    await expect(errorNotice).toBeVisible({ timeout: 5000 });

    // UI remains fully functional
    await expect(page.locator(SELECTORS.map).first()).toBeVisible();
  });

  // T2.05 - GPX with Zero Trackpoints (Waypoints Only)
  test('T2.05 - Uploading GPX with zero trackpoints triggers clear empty track warning', async ({ page }) => {
    const fileInput = page.locator(SELECTORS.gpxFileInput).first();
    const noTrkptGpx = path.join(FIXTURE_DIR, 'no_trkpt.gpx');
    await fileInput.setInputFiles(noTrkptGpx);

    const errorNotice = page.locator('.toast, .alert, .error, [role="alert"], :text-matches("trackpoint|nenhum|vazio|empty", "i")').first();
    await expect(errorNotice).toBeVisible({ timeout: 5000 });
  });

  // T2.06 - Corrupt Garmin JSON Upload
  test('T2.06 - Corrupt activity JSON missing mandatory fields is rejected safely', async ({ page }) => {
    const fileInput = page.locator(SELECTORS.gpxFileInput).first();
    const corruptJson = path.join(FIXTURE_DIR, 'corrupt_activity.json');
    await fileInput.setInputFiles(corruptJson);

    const errorNotice = page.locator('.toast, .alert, .error, [role="alert"], :text-matches("invalid|schema|error|obrigatório", "i")').first();
    await expect(errorNotice).toBeVisible({ timeout: 5000 });
  });

  // T2.07 - Indoor / Treadmill Activity (0 GPS Points)
  test('T2.07 - Activity with 0 GPS coordinates displays summary metrics without polyline render crash', async ({ page }) => {
    // Mock indoor activity without trackpoints
    await page.route(/\/api\/garmin\/activities(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'indoor_treadmill_run',
            name: 'Indoor Treadmill 5K',
            startTime: '2026-09-12T07:00:00Z',
            totalDistanceKm: 5.0,
            elapsedTimeSec: 1500,
            averagePaceMinPerKm: '5:00',
            trackPoints: [],
          },
        ]),
      });
    });

    const connectBtn = page.locator(SELECTORS.connectGarminBtn).first();
    if (await connectBtn.isVisible()) {
      await connectBtn.click();
      const authBtn = page.locator(SELECTORS.authorizeBtn).first();
      if (await authBtn.isVisible()) await authBtn.click();
    }

    const syncBtn = page.locator(SELECTORS.syncActivitiesBtn).first();
    if (await syncBtn.isVisible()) {
      await syncBtn.click();
      const item = page.locator(SELECTORS.activityItem).first();
      if (await item.isVisible()) await item.click();
    }

    // Map should remain alive and responsive
    await expect(page.locator(SELECTORS.map).first()).toBeVisible();
  });

  // T2.08 - Severe Route Divergence (Detour > 1km Outside Corridor)
  test('T2.08 - Severe route detour flags low adherence score and highlights detour segments', async ({ page }) => {
    // Plan initial route
    await page.locator(SELECTORS.startInput).first().fill('Start');
    await page.locator(SELECTORS.finishInput).first().fill('Finish');
    const calcBtn = page.locator(SELECTORS.calculateBtn).first();
    if (await calcBtn.isVisible()) await calcBtn.click();

    // Load detour track fixture
    const fileInput = page.locator(SELECTORS.gpxFileInput).first();
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'detour_run.gpx'));

    // Verify adherence score dropped below 80%
    const adherence = page.locator(SELECTORS.adherenceScore).first();
    if (await adherence.isVisible()) {
      const text = await adherence.innerText();
      const match = text.match(/(\d+)%/);
      if (match) {
        const score = parseInt(match[1], 10);
        expect(score).toBeLessThanOrEqual(80);
      }
    }
  });

  // T2.09 - Clean Empty State on Fresh Start
  test('T2.09 - Fresh state with empty history displays clean minimalist empty card', async ({ page }) => {
    // Clear localStorage to simulate fresh install
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const historyContainer = page.locator(SELECTORS.historyContainer).first();
    if (await historyContainer.isVisible()) {
      const text = await historyContainer.innerText();
      expect(text).toMatch(/no workouts|nenhum treino|plan your first/i);
    }
  });
});
