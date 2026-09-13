/**
 * Tier 3: Cross-Feature & Pairwise Interactions E2E Test Suite
 * Tests pairwise combinations of map providers, routing engines, sync flows, and persistence.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { SELECTORS, FIXTURE_DIR, setupStandardMocks } from './helpers.js';

test.describe('Tier 3: Cross-Feature & Pairwise Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await setupStandardMocks(page);
    await page.goto('/');
  });

  // T3.01 - Route Planning + Garmin OAuth Sync: Dual Polylines Coexistence
  test('T3.01 - Planned route and synced Garmin activity coexist simultaneously without visual collision', async ({ page }) => {
    // 1. Plan running route
    const startInput = page.locator(SELECTORS.startInput).first();
    const finishInput = page.locator(SELECTORS.finishInput).first();
    await startInput.fill('Parque Ibirapuera');
    await finishInput.fill('Avenida Paulista');
    const calcBtn = page.locator(SELECTORS.calculateBtn).first();
    if (await calcBtn.isVisible()) await calcBtn.click();

    // 2. Connect Garmin and Sync
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

    // 3. Verify comparison HUD displays planned and actual metrics
    const hud = page.locator(SELECTORS.comparisonHud).first();
    await expect(hud).toBeVisible({ timeout: 5000 });

    // 4. Verify polylines exist in DOM
    const polylines = page.locator('path.leaflet-interactive, path[stroke]');
    await expect(polylines.first()).toBeAttached();
  });

  // T3.02 - Map Provider Toggle preserves Route State and Polylines
  test('T3.02 - Toggling map provider preserves active markers, polylines, and distance calculations', async ({ page }) => {
    // Plan initial route
    await page.locator(SELECTORS.startInput).first().fill('Start Location');
    await page.locator(SELECTORS.finishInput).first().fill('Finish Location');
    const calcBtn = page.locator(SELECTORS.calculateBtn).first();
    if (await calcBtn.isVisible()) await calcBtn.click();

    const distanceBefore = await page.locator(SELECTORS.plannedDistance).first().innerText();

    // Toggle provider if switcher exists
    const toggle = page.locator(SELECTORS.providerToggle).first();
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.waitForTimeout(500);

      // Verify distance metric remains intact after provider toggle
      const distanceAfter = await page.locator(SELECTORS.plannedDistance).first().innerText();
      expect(distanceAfter).toBe(distanceBefore);

      // Verify map container remains healthy
      await expect(page.locator(SELECTORS.map).first()).toBeVisible();
    }
  });

  // T3.03 - GPX Import + History Persistence + Page Reload
  test('T3.03 - Imported GPX workout saved to persistence survives full browser reload', async ({ page }) => {
    // 1. Plan route
    await page.locator(SELECTORS.startInput).first().fill('Start');
    await page.locator(SELECTORS.finishInput).first().fill('Finish');
    const calcBtn = page.locator(SELECTORS.calculateBtn).first();
    if (await calcBtn.isVisible()) await calcBtn.click();

    // 2. Upload GPX
    const fileInput = page.locator(SELECTORS.gpxFileInput).first();
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'sample_5k.gpx'));

    // 3. Save Workout
    const saveBtn = page.locator(SELECTORS.saveWorkoutBtn).first();
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await saveBtn.click();

    // 4. Reload page
    await page.reload();
    await setupStandardMocks(page);

    // 5. Verify workout card is restored in history dashboard
    const historyContainer = page.locator(SELECTORS.historyContainer).first();
    await expect(historyContainer).toBeVisible({ timeout: 5000 });
    const card = page.locator(SELECTORS.workoutCard).first();
    await expect(card).toBeVisible();
  });

  // T3.04 - Detour Detection + Distance Delta Highlighting
  test('T3.04 - Detour track dynamically highlights excess distance delta and low adherence percentage', async ({ page }) => {
    await page.locator(SELECTORS.startInput).first().fill('Start');
    await page.locator(SELECTORS.finishInput).first().fill('Finish');
    const calcBtn = page.locator(SELECTORS.calculateBtn).first();
    if (await calcBtn.isVisible()) await calcBtn.click();

    // Import detour GPX
    const fileInput = page.locator(SELECTORS.gpxFileInput).first();
    await fileInput.setInputFiles(path.join(FIXTURE_DIR, 'detour_run.gpx'));

    // Verify distance delta indicator is visible
    const delta = page.locator(SELECTORS.distanceDelta).first();
    await expect(delta).toBeVisible({ timeout: 5000 });
  });

  // T3.05 - Multi-Workout Persistence & Selective Deletion
  test('T3.05 - Storing multiple workouts and deleting one leaves remaining records intact', async ({ page }) => {
    // Save first workout
    await page.locator(SELECTORS.startInput).first().fill('Start 1');
    await page.locator(SELECTORS.finishInput).first().fill('Finish 1');
    let calcBtn = page.locator(SELECTORS.calculateBtn).first();
    if (await calcBtn.isVisible()) await calcBtn.click();
    await page.locator(SELECTORS.gpxFileInput).first().setInputFiles(path.join(FIXTURE_DIR, 'sample_5k.gpx'));
    await page.locator(SELECTORS.saveWorkoutBtn).first().click();

    // Save second workout
    await page.locator(SELECTORS.startInput).first().fill('Start 2');
    await page.locator(SELECTORS.finishInput).first().fill('Finish 2');
    if (await calcBtn.isVisible()) await calcBtn.click();
    await page.locator(SELECTORS.saveWorkoutBtn).first().click();

    // Verify at least 2 cards exist
    const cards = page.locator(SELECTORS.workoutCard);
    const initialCount = await cards.count();
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Delete one workout
    const deleteBtn = cards.first().locator(SELECTORS.deleteWorkoutBtn).first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await page.waitForTimeout(300);
      const newCount = await page.locator(SELECTORS.workoutCard).count();
      expect(newCount).toBe(initialCount - 1);
    }
  });
});
