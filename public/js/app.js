/**
 * Garmin Running Tracker — Main Application Entry Point
 * Integrado com Mapa A/B, Garmin Connect API/OAuth, Sobreposição GPS e Histórico
 */

import { MapManager } from './map/mapAdapter.js';
import { RoutePlanner } from './components/routePlanner.js';
import { RouteHud } from './components/statsOverlay.js';
import { routingService } from './services/routingService.js';
import { SyncModal } from './components/syncModal.js';
import { garminService } from './services/garminService.js';
import { GarminSync } from './components/garminSync.js';
import { RouteComparison } from './components/routeComparison.js';
import { RunHistory } from './components/runHistory.js';

export class App {
  constructor() {
    this.mapManager = new MapManager();
    this.hud = null;
    this.routePlanner = null;
    this.syncModal = null;
    this.currentGarminActivity = null;
    this.garminSync = null;
    this.routeComparison = null;
    this.runHistory = null;

    this.keyModal = null;
    this.apiKeyInput = null;
    this.currentRouteRequestId = 0;
    this.currentPlannedRoute = null;
  }

  async init() {
    // 1. Cache Modal and Form Elements
    this.keyModal = document.getElementById('google-key-modal');
    this.apiKeyInput = document.getElementById('google-api-key-input');

    // 2. Initialize HUD Stats Overlay
    this.hud = new RouteHud('route-hud');

    // 3. Initialize Map Provider Layer with Leaflet
    await this.mapManager.init('map-container', { lat: -23.5505, lng: -46.6333 }, 14);

    // 4. Initialize Route Planner
    this.routePlanner = new RoutePlanner({
      containerId: 'route-planner-slot',
      mapAdapter: this.mapManager,
      callbacks: {
        onRouteRequested: async (startPos, finishPos) => {
          await this.handleRouteRequested(startPos, finishPos);
        },
        onRouteCleared: () => {
          this.handleRouteCleared();
        }
      }
    });

    // 5. Initialize Route Comparison Component (Garmin Overlay)
    this.routeComparison = new RouteComparison({
      mapAdapter: this.mapManager,
      container: document.getElementById('comparison-stats-slot'),
      onSaveRun: (runPayload) => {
        if (this.runHistory) {
          this.runHistory.addRun(runPayload);
        }
      }
    });

    // 6. Initialize Garmin Sync Modal (Milestone 2)
    this.syncModal = new SyncModal({
      modalId: 'garmin-modal',
      connectBtnId: 'connect-garmin-btn',
      fileInputId: 'gpx-file-input',
      onActivitySelected: (activity) => this.handleGarminActivityLoaded(activity),
      onFileLoaded: (activity) => this.handleGarminActivityLoaded(activity),
      onError: (msg, type) => this.showToast(msg, type)
    });

    const btnCloseComparison = document.getElementById('btn-close-comparison');
    if (btnCloseComparison) {
      btnCloseComparison.addEventListener('click', () => this.handleComparisonClosed());
    }

    const btnSaveWorkout = document.getElementById('save-workout-btn');
    if (btnSaveWorkout) {
      btnSaveWorkout.addEventListener('click', () => this.handleSaveWorkout());
    }

    // 7. Initialize Run History Component
    this.runHistory = new RunHistory({
      onSelectRun: (savedRun) => {
        if (this.routeComparison && savedRun.actualTrack) {
          const mockActivity = {
            id: savedRun.id,
            name: savedRun.name,
            date: savedRun.date || savedRun.createdAt,
            distanceKm: savedRun.actualDistanceKm,
            durationFormatted: savedRun.durationFormatted,
            avgPace: savedRun.avgPace,
            track: savedRun.actualTrack
          };
          this.routeComparison.showActivity(mockActivity, savedRun.plannedDistanceKm || 0);
          this.showToast(`Carregou treino histórico: "${savedRun.name}"`, 'info');
        }
      },
      onToast: (msg, type) => this.showToast(msg, type)
    });

    // 8. Wire UI Provider Switcher
    this.setupProviderSwitcher();

    // 9. Setup Toast Listener
    this.setupToastNotifications();

    // 10. Setup Key Modal Handlers
    this.setupKeyModal();

    console.log('[App] Garmin Running Tracker inicializado com sucesso!', this.mapManager.getProviderName());
  }

  async handleRouteRequested(startPos, finishPos) {
    const requestId = ++this.currentRouteRequestId;

    if (this.hud) {
      this.hud.showCalculating();
    }

    try {
      const route = await routingService.calculateRoute(startPos, finishPos);
      if (requestId !== this.currentRouteRequestId) return;
      if (!this.routePlanner?.pointA || !this.routePlanner?.pointB) return;
      if (!route || !route.points || route.points.length === 0) return;

      this.currentPlannedRoute = route;

      // Render Planned corridor (Sapphire Blue #3B82F6, 6px)
      this.mapManager.renderPolyline('planned-route', route.points, {
        color: '#3B82F6',
        weight: 6,
        opacity: 0.8
      });

      // Frame map viewport around route
      if (this.currentGarminActivity && this.currentGarminActivity.trackPoints?.length >= 2) {
        this.mapManager.fitBounds([...route.points, ...this.currentGarminActivity.trackPoints], [60, 40]);
      } else {
        this.mapManager.fitBounds(route.points, [60, 40]);
      }

      // Update HUD
      if (this.hud) {
        this.hud.updateRoute(route);
      }

      // Update Comparison HUD if Garmin activity is active
      if (this.currentGarminActivity) {
        this.displayComparisonHud(this.currentGarminActivity);
      }
    } catch (err) {
      if (requestId !== this.currentRouteRequestId) return;
      console.error('[App] Failed to calculate route:', err);
      this.showToast('Erro ao calcular trajeto da corrida.', 'warning');
      if (this.hud) {
        this.hud.hide();
      }
    }
  }

  handleRouteCleared() {
    this.currentRouteRequestId++;
    this.currentPlannedRoute = null;
    this.mapManager.removePolyline('planned-route');
    this.mapManager.removePolyline('route');
    if (this.hud) {
      this.hud.hide();
    }
    if (this.routeComparison) {
      this.routeComparison.clearComparison();
    }
    if (this.currentGarminActivity) {
      this.displayComparisonHud(this.currentGarminActivity);
    }
  }

  setupProviderSwitcher() {
    const btnLeaflet = document.getElementById('btn-provider-leaflet');
    const btnGoogle = document.getElementById('btn-provider-google');

    if (btnLeaflet) {
      btnLeaflet.addEventListener('click', async () => {
        await this.mapManager.switchProvider('leaflet');
      });
    }

    if (btnGoogle) {
      btnGoogle.addEventListener('click', async () => {
        const existingKey = localStorage.getItem('google_maps_api_key');
        if (!existingKey) {
          this.openKeyModal();
        } else {
          await this.mapManager.switchProvider('google');
        }
      });
    }

    window.addEventListener('map:provider-changed', (e) => {
      const current = e.detail.provider;
      if (btnLeaflet && btnGoogle) {
        if (current === 'leaflet') {
          btnLeaflet.classList.add('active');
          btnLeaflet.setAttribute('aria-checked', 'true');
          btnGoogle.classList.remove('active');
          btnGoogle.setAttribute('aria-checked', 'false');
        } else {
          btnGoogle.classList.add('active');
          btnGoogle.setAttribute('aria-checked', 'true');
          btnLeaflet.classList.remove('active');
          btnLeaflet.setAttribute('aria-checked', 'false');
        }
      }
    });
  }

  openKeyModal() {
    if (!this.keyModal) return;
    this.keyModal.classList.remove('hidden');
    if (this.apiKeyInput) this.apiKeyInput.focus();
  }

  closeKeyModal() {
    if (!this.keyModal) return;
    this.keyModal.classList.add('hidden');
    if (this.apiKeyInput) this.apiKeyInput.value = '';
  }

  setupKeyModal() {
    const btnCancel = document.getElementById('btn-cancel-key');
    const btnConfirm = document.getElementById('btn-confirm-key');

    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        this.closeKeyModal();
      });
    }

    if (btnConfirm) {
      btnConfirm.addEventListener('click', async () => {
        const key = this.apiKeyInput ? this.apiKeyInput.value.trim() : '';
        if (!key) {
          alert('Por favor, digite uma chave de API válida.');
          return;
        }
        this.closeKeyModal();
        await this.mapManager.switchProvider('google', key);
      });
    }
  }

  handleGarminActivityLoaded(activity) {
    if (!activity) return;
    this.currentGarminActivity = activity;

    // 1. Overlay actual GPS track (Sunset Orange #FF6600, 3.5px) if trackpoints exist
    if (activity.trackPoints && activity.trackPoints.length >= 2) {
      this.mapManager.renderPolyline('actual-route', activity.trackPoints, {
        color: '#FF6600',
        weight: 3.5,
        opacity: 0.9,
      });

      // Auto-framing: Frame both planned corridor and actual track
      if (this.currentPlannedRoute?.points?.length) {
        this.mapManager.fitBounds([...this.currentPlannedRoute.points, ...activity.trackPoints], [60, 40]);
      } else {
        this.mapManager.fitBounds(activity.trackPoints, [60, 40]);
      }
    } else {
      // T2.07: Indoor / Treadmill 0-GPS point activity -> safely remove actual-route polyline without crashing
      this.mapManager.removePolyline('actual-route');
      console.log('[App] Indoor activity with 0 GPS points. Displaying summary telemetry only.');
    }

    // 2. Render Comparison HUD
    this.displayComparisonHud(activity);
  }

  displayComparisonHud(activity) {
    const hud = document.getElementById('comparison-hud');
    if (!hud) return;

    hud.classList.remove('hidden');

    const titleEl = document.getElementById('comparison-activity-name');
    if (titleEl) titleEl.textContent = activity.name || 'Treino Garmin';

    const distEl = document.getElementById('actual-distance');
    if (distEl) {
      distEl.textContent = typeof activity.totalDistanceKm === 'number'
        ? activity.totalDistanceKm.toFixed(2)
        : activity.totalDistanceKm;
    }

    // Actual Pace (Selector: #actual-pace, [data-testid="actual-pace"])
    const paceEl = document.getElementById('actual-pace');
    if (paceEl) {
      const paceStr = activity.averagePaceMinPerKm || '--:--';
      paceEl.textContent = paceStr.includes('/km') ? paceStr : `${paceStr} /km`;
    }

    // Actual Time (Selector: #actual-time, [data-testid="actual-time"])
    const timeEl = document.getElementById('actual-time');
    if (timeEl) {
      timeEl.textContent = this.formatDuration(activity.elapsedTimeSec || 0);
    }

    // Comparison Metrics (Delta & Adherence)
    const deltaEl = document.getElementById('distance-delta');
    const adherenceEl = document.getElementById('adherence-score');
    const barEl = document.getElementById('comparison-bar');

    if (this.currentPlannedRoute && typeof this.currentPlannedRoute.distanceKm === 'number') {
      const planned = this.currentPlannedRoute.distanceKm;
      const actual = activity.totalDistanceKm;
      const diff = actual - planned;
      const sign = diff >= 0 ? '+' : '';
      if (deltaEl) deltaEl.textContent = `${sign}${diff.toFixed(2)} km`;

      const score = Math.max(0, Math.min(100, Math.round((1 - Math.abs(diff) / planned) * 100)));
      if (adherenceEl) adherenceEl.textContent = `${score}%`;
      if (barEl) barEl.value = score;
    } else {
      if (deltaEl) deltaEl.textContent = '--';
      if (adherenceEl) adherenceEl.textContent = '100%';
      if (barEl) barEl.value = 100;
    }
  }

  handleComparisonClosed() {
    const hud = document.getElementById('comparison-hud');
    if (hud) hud.classList.add('hidden');
    this.mapManager.removePolyline('actual-route');
    this.currentGarminActivity = null;
  }

  handleSaveWorkout() {
    if (!this.currentGarminActivity) return;
    this.showToast(`Treino "${this.currentGarminActivity.name}" salvo com sucesso!`, 'info');
  }

  formatDuration(totalSec) {
    if (!totalSec || totalSec <= 0) return '00:00';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  showToast(message, type = 'info') {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, type } }));
  }

  setupToastNotifications() {
    const container = document.getElementById('toast-container');
    if (!container) return;

    window.addEventListener('app:toast', (e) => {
      const { message, type = 'info' } = e.detail;
      const toast = document.createElement('div');
      toast.className = type === 'error' ? 'toast error alert' : `toast ${type} alert`;
      toast.setAttribute('role', 'alert');
      toast.textContent = message;
      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.4s ease';
        setTimeout(() => toast.remove(), 400);
      }, 5000);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  window.garminApp = app;
  app.init();
});