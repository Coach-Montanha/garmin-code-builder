/**
 * Tier 4: Real-World Scenarios & Resiliency E2E Test Suite
 * End-to-end athlete workflows, network outage recovery, and responsive cross-device usability.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { SELECTORS, FIXTURE_DIR, setupStandardMocks } from './helpers.js';

test.describe('Tier 4: Real-World Runner Scenarios & Resiliency', () => {
  // Scenario 1: Complete 5K Runner Journey
  test('T4.01 - End-to-End Runner Workflow: Plan 5K, Connect Garmin, Sync Activity, Compare, Save & Reload', async ({ page }) => {
    await setupStandardMocks(page);
    await page.goto('/');

    // 1. Plan 5K Route
    const startInput = page.locator(SELECTORS.startInput).first();
    const finishInput = page.locator(SELECTORS.finishInput).first();
    await expect(startInput).toBeVisible();
    await startInput.fill('Parque Ibirapuera Portão 3');
    await finishInput.fill('Monumento às Bandeiras');

    const calcBtn = page.locator(SELECTORS.calculateBtn).first();
    if (await calcBtn.isVisible()) {
      await calcBtn.click();
    }

    // 2. Validate Planned Distance
    const plannedDistance = page.locator(SELECTORS.plannedDistance).first();
    await expect(plannedDistance).toBeVisible({ timeout: 5000 });
    const plannedText = await plannedDistance.innerText();
    expect(plannedText).toMatch(/\d+(\.\d+)?\s*km/i);

    // 3. Connect Garmin Connect via OAuth modal
    const connectBtn = page.locator(SELECTORS.connectGarminBtn).first();
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();

    const authModal = page.locator(SELECTORS.garminModal).first();
    await expect(authModal).toBeVisible({ timeout: 5000 });

    const authBtn = page.locator(SELECTORS.authorizeBtn).first();
    await expect(authBtn).toBeVisible();
    await authBtn.click();

    // 4. Sync Morning Run
    const syncBtn = page.locator(SELECTORS.syncActivitiesBtn).first();
    if (await syncBtn.isVisible()) {
      await syncBtn.click();
      const activity = page.locator(SELECTORS.activityItem).first();
      if (await activity.isVisible()) {
        await activity.click();
      }
    } else {
      // Fallback to fixture import if direct sync button is configured for auto-load
      const fileInput = page.locator(SELECTORS.gpxFileInput).first();
      await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'sample_5k.gpx'));
    }

    // 5. Inspect Comparison HUD & Dual Polyline
    const hud = page.locator(SELECTORS.comparisonHud).first();
    await expect(hud).toBeVisible({ timeout: 5000 });

    // 6. Save Workout to Persistent History
    const saveBtn = page.locator(SELECTORS.saveWorkoutBtn).first();
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // 7. Refresh Page & Verify Workout Restoration
    await page.reload();
    await setupStandardMocks(page);

    const historyCard = page.locator(SELECTORS.workoutCard).first();
    await expect(historyCard).toBeVisible({ timeout: 5000 });

    // 8. Re-inspect by clicking card
    await historyCard.click();
    await expect(page.locator(SELECTORS.comparisonHud).first()).toBeVisible();
  });

  // Scenario 2: Network Outage Recovery & Offline Routing Fallback
  test('T4.02 - Network Disruption: Recovers seamlessly during OSRM outage with Haversine fallback and local GPX parsing', async ({ page }) => {
    // Setup standard mocks with routing failure
    await setupStandardMocks(page, { failRouting: true });
    await page.goto('/');

    // Plan route under simulated routing outage
    await page.locator(SELECTORS.startInput).first().fill('Praça da Sé');
    await page.locator(SELECTORS.finishInput).first().fill('Avenida Paulista');
    const calcBtn = page.locator(SELECTORS.calculateBtn).first();
    if (await calcBtn.isVisible()) await calcBtn.click();

    // Verify distance is still computed via Haversine fallback
    const plannedDistance = page.locator(SELECTORS.plannedDistance).first();
    await expect(plannedDistance).toBeVisible({ timeout: 6000 });

    // Upload local GPX file from watch while offline
    const fileInput = page.locator(SELECTORS.gpxFileInput).first();
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'sample_5k.gpx'));

    // Verify comparison HUD renders successfully
    await expect(page.locator(SELECTORS.comparisonHud).first()).toBeVisible({ timeout: 5000 });
  });

  // Scenario 3: Responsive Viewport on Mobile Devices (375x667)
  test('T4.03 - Mobile Viewport: UI adapts responsively to mobile screen without layout clipping', async ({ page }) => {
    // Emulate iPhone SE viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await setupStandardMocks(page);
    await page.goto('/');

    const map = page.locator(SELECTORS.map).first();
    await expect(map).toBeVisible({ timeout: 10000 });

    const box = await map.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeLessThanOrEqual(375);
    expect(box.height).toBeGreaterThan(200);

    // Verify inputs remain accessible
    await expect(page.locator(SELECTORS.startInput).first()).toBeVisible();
    await expect(page.locator(SELECTORS.finishInput).first()).toBeVisible();
  });
});
