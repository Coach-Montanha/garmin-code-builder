/**
 * @file statsOverlay.js
 * @description Minimalist HUD manager for displaying planned route metrics, distance, and duration.
 */

import { formatDuration } from '../services/routingService.js';

export class RouteHud {
  /**
   * @param {string} [containerId='route-hud'] 
   */
  constructor(containerId = 'route-hud') {
    this.container = document.getElementById(containerId);
    this.distEl = document.getElementById('hud-distance');
    this.durationEl = document.getElementById('hud-duration');
    this.badgeEl = document.getElementById('hud-source-badge');
  }

  /**
   * Displays the HUD in calculating / loading state.
   */
  showCalculating() {
    if (!this.container) return;
    if (this.badgeEl) {
      this.badgeEl.className = 'badge badge-calculating';
      this.badgeEl.textContent = 'Calculando...';
    }
  }

  /**
   * Updates HUD with calculated route data.
   * @param {{ distanceKm: number, estimatedDurationSec: number, source: string }} routeResult 
   */
  updateRoute(routeResult) {
    if (!this.container || !routeResult) return;
    this.container.classList.remove('hidden');

    if (this.distEl) {
      this.distEl.textContent = typeof routeResult.distanceKm === 'number' 
        ? routeResult.distanceKm.toFixed(2) 
        : routeResult.distanceKm;
    }

    if (this.durationEl) {
      this.durationEl.textContent = `~${formatDuration(routeResult.estimatedDurationSec || 0)}`;
    }

    if (this.badgeEl) {
      if (routeResult.source === 'osrm') {
        this.badgeEl.className = 'badge badge-osrm';
        this.badgeEl.textContent = 'OSRM Foot';
        this.badgeEl.title = 'Rota calculada via malha viária para pedestres';
      } else {
        this.badgeEl.className = 'badge badge-fallback';
        this.badgeEl.textContent = 'Offline (1.25x)';
        this.badgeEl.title = 'Estimativa geodésica com circuidade urbana de 1.25x';
      }
    }
  }

  /**
   * Hides the HUD and resets metrics.
   */
  hide() {
    if (!this.container) return;
    this.container.classList.add('hidden');
    if (this.distEl) this.distEl.textContent = '--';
    if (this.durationEl) this.durationEl.textContent = '--';
  }
}

export const StatsOverlay = RouteHud;
