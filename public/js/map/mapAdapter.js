/**
 * MapManager — Unified provider router and state orchestrator for IMapAdapter.
 * Encapsulates LeafletAdapter and GoogleAdapter, maintaining continuous state
 * across provider toggling and automated fallback events.
 */

import { LeafletAdapter } from './leafletAdapter.js';
import { GoogleAdapter } from './googleAdapter.js';

export class MapManager {
  constructor() {
    this.activeAdapter = null;
    this.currentProvider = 'leaflet';
    this.containerId = null;

    // Canonical State Cache
    this.lastCenter = { lat: -23.5505, lng: -46.6333 };
    this.lastZoom = 14;
    this.markersState = new Map(); // id -> { position, options }
    this.polylinesState = new Map(); // id -> { points, options }
    this.clickHandlers = new Set();
    this.dragHandlers = new Map(); // id -> Set<Function>

    // Configuration
    this.googleApiKey = null;
  }

  getProviderName() {
    return this.activeAdapter ? this.activeAdapter.getProviderName() : this.currentProvider;
  }

  /**
   * Initializes the map provider layer with Leaflet as default.
   * @param {string} containerId
   * @param {{ lat: number, lng: number }} initialCenter
   * @param {number} zoom
   */
  async init(containerId, initialCenter = { lat: -23.5505, lng: -46.6333 }, zoom = 14) {
    this.containerId = containerId;
    this.lastCenter = initialCenter;
    this.lastZoom = zoom;

    // Check stored Google API key if available
    if (typeof localStorage !== 'undefined') {
      this.googleApiKey = localStorage.getItem('google_maps_api_key') || null;
    }
    if (typeof window !== 'undefined' && window.GOOGLE_MAPS_API_KEY) {
      this.googleApiKey = window.GOOGLE_MAPS_API_KEY;
    }

    // Initialize default Leaflet provider
    this.activeAdapter = new LeafletAdapter();
    await this.activeAdapter.init(containerId, initialCenter, zoom);
    this.currentProvider = 'leaflet';
    this.dispatchProviderChanged('leaflet');
  }

  /**
   * Switches the active provider ('leaflet' | 'google') with zero data loss.
   * @param {'leaflet' | 'google'} targetProvider
   * @param {string|null} apiKey Optional new API key for Google Maps
   */
  async switchProvider(targetProvider, apiKey = null) {
    if (targetProvider === this.currentProvider && this.activeAdapter) {
      return;
    }

    if (apiKey) {
      this.googleApiKey = apiKey;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('google_maps_api_key', apiKey);
      }
    }

    // 1. Capture current viewport state
    if (this.activeAdapter) {
      try {
        this.lastCenter = this.activeAdapter.getCenter();
        this.lastZoom = this.activeAdapter.getZoom();
      } catch (e) {
        console.warn('[MapManager] Failed to read center/zoom before switch:', e);
      }
    }

    // 2. Prepare new adapter instance
    let nextAdapter = null;

    if (targetProvider === 'google') {
      const keyToUse = this.googleApiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('google_maps_api_key') : null);
      if (!keyToUse) {
        this.notify('Chave de API do Google Maps necessária para ativar este provedor.', 'warning');
        this.dispatchFallbackTriggered('MISSING_KEY');
        return;
      }

      nextAdapter = new GoogleAdapter({
        apiKey: keyToUse,
        onFallback: (reason) => this.handleFallback(reason)
      });
    } else {
      nextAdapter = new LeafletAdapter();
    }

    // 3. Attempt initialization of new provider
    try {
      if (this.activeAdapter) {
        this.activeAdapter.destroy();
        this.activeAdapter = null;
      }

      await nextAdapter.init(this.containerId, this.lastCenter, this.lastZoom);
      this.activeAdapter = nextAdapter;
      this.currentProvider = targetProvider;

      // 4. Restore all state
      this.restoreCachedState();

      this.dispatchProviderChanged(targetProvider);
      this.notify(`Provedor alterado para ${targetProvider === 'google' ? 'Google Maps' : 'Leaflet (OSM)'}.`, 'info');
    } catch (err) {
      console.warn(`[MapManager] Provider switch to ${targetProvider} failed:`, err);
      // Automatic silent fallback to Leaflet if Google fails
      if (targetProvider === 'google') {
        await this.handleFallback(err.message || 'INIT_ERROR');
      }
    }
  }

  /**
   * Restores cached markers, polylines, and event listeners onto active adapter.
   */
  restoreCachedState() {
    if (!this.activeAdapter) return;

    // Restore markers
    this.markersState.forEach((data, id) => {
      this.activeAdapter.addMarker(id, data.position, data.options);
      const handlers = this.dragHandlers.get(id);
      if (handlers) {
        handlers.forEach(h => this.activeAdapter.onMarkerDrag(id, h));
      }
    });

    // Restore polylines
    this.polylinesState.forEach((data, id) => {
      this.activeAdapter.renderPolyline(id, data.points, data.options);
    });

    // Restore map click handlers
    this.clickHandlers.forEach(h => {
      this.activeAdapter.onMapClick(h);
    });
  }

  /**
   * Graceful fallback handler: restores Leaflet immediately.
   */
  async handleFallback(reason = 'UNKNOWN') {
    if (this.currentProvider === 'leaflet') return; // Already on Leaflet

    console.warn(`[MapManager] Executing automatic fallback to Leaflet. Reason: ${reason}`);

    if (this.activeAdapter) {
      try {
        this.activeAdapter.destroy();
      } catch (e) {}
      this.activeAdapter = null;
    }

    this.activeAdapter = new LeafletAdapter();
    await this.activeAdapter.init(this.containerId, this.lastCenter, this.lastZoom);
    this.currentProvider = 'leaflet';

    this.restoreCachedState();
    this.dispatchProviderChanged('leaflet');
    this.dispatchFallbackTriggered(reason);

    const friendlyMessages = {
      MISSING_KEY: 'Chave da API Google Maps não encontrada. Usando Leaflet.',
      TIMEOUT: 'Tempo limite do Google Maps excedido. Alternando para Leaflet.',
      NETWORK_ERROR: 'Erro de conexão com Google Maps. Alternando para Leaflet.',
      AUTH_FAILURE: 'Chave Google Maps inválida ou recusada. Alternando para Leaflet.'
    };

    const message = friendlyMessages[reason] || 'Google Maps indisponível. Alternando para Leaflet.';
    this.notify(message, 'warning');
  }

  // --- IMapAdapter Delegated Operations ---

  setCenter(center, zoom) {
    this.lastCenter = center;
    if (typeof zoom === 'number') this.lastZoom = zoom;
    if (this.activeAdapter) this.activeAdapter.setCenter(center, zoom);
  }

  getCenter() {
    return this.activeAdapter ? this.activeAdapter.getCenter() : this.lastCenter;
  }

  getZoom() {
    return this.activeAdapter ? this.activeAdapter.getZoom() : this.lastZoom;
  }

  addMarker(id, position, options = {}) {
    this.markersState.set(id, { position, options });
    if (this.activeAdapter) {
      this.activeAdapter.addMarker(id, position, options);
    }
  }

  removeMarker(id) {
    this.markersState.delete(id);
    if (this.activeAdapter) {
      this.activeAdapter.removeMarker(id);
    }
  }

  updateMarkerPosition(id, position) {
    const existing = this.markersState.get(id);
    if (existing) {
      existing.position = position;
      this.markersState.set(id, existing);
    }
    if (this.activeAdapter) {
      this.activeAdapter.updateMarkerPosition(id, position);
    }
  }

  renderPolyline(id, points, options = {}) {
    this.polylinesState.set(id, { points, options });
    if (this.activeAdapter) {
      this.activeAdapter.renderPolyline(id, points, options);
    }
  }

  removePolyline(id) {
    this.polylinesState.delete(id);
    if (this.activeAdapter) {
      this.activeAdapter.removePolyline(id);
    }
  }

  fitBounds(points, padding) {
    if (this.activeAdapter) {
      this.activeAdapter.fitBounds(points, padding);
    }
  }

  onMapClick(handler) {
    this.clickHandlers.add(handler);
    if (this.activeAdapter) {
      this.activeAdapter.onMapClick(handler);
    }
  }

  onMarkerDrag(id, handler) {
    if (!this.dragHandlers.has(id)) {
      this.dragHandlers.set(id, new Set());
    }
    this.dragHandlers.get(id).add(handler);
    if (this.activeAdapter) {
      this.activeAdapter.onMarkerDrag(id, handler);
    }
  }

  destroy() {
    if (this.activeAdapter) {
      this.activeAdapter.destroy();
      this.activeAdapter = null;
    }
    this.markersState.clear();
    this.polylinesState.clear();
    this.clickHandlers.clear();
    this.dragHandlers.clear();
  }

  // --- Event & Notification Helpers ---

  dispatchProviderChanged(provider) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('map:provider-changed', {
        detail: { provider }
      }));
    }
  }

  dispatchFallbackTriggered(reason) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('map:fallback-triggered', {
        detail: { reason }
      }));
    }
  }

  notify(message, type = 'info') {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message, type }
      }));
    }
  }
}
