/**
 * GoogleAdapter — Implementation of IMapAdapter for Google Maps JavaScript API v3
 * Features dynamic script loading, 4000ms timeout guard, window.gm_authFailure interception,
 * and silent fallback callback dispatch.
 */

let googleMapsScriptPromise = null;

export class GoogleAdapter {
  constructor(options = {}) {
    this.apiKey = options.apiKey || null;
    this.onFallback = options.onFallback || null; // Callback: (reason: string) => void
    this.map = null;
    this.containerId = null;
    this.markers = new Map(); // id -> google.maps.Marker
    this.polylines = new Map(); // id -> google.maps.Polyline
    this.clickHandlers = new Set();
    this.dragHandlers = new Map(); // id -> Set<Function>
    this.authFailureTriggered = false;
  }

  getProviderName() {
    return 'google';
  }

  /**
   * Injects Google Maps JavaScript API with safety timeout & auth failure trap.
   * @param {string} apiKey
   * @returns {Promise<typeof google>}
   */
  static loadGoogleScript(apiKey) {
    if (window.google && window.google.maps && window.google.maps.Map) {
      return Promise.resolve(window.google);
    }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '' || apiKey === 'YOUR_API_KEY') {
      return Promise.reject(new Error('MISSING_KEY: Chave de API do Google Maps não configurada.'));
    }

    if (googleMapsScriptPromise) {
      return googleMapsScriptPromise;
    }

    googleMapsScriptPromise = new Promise((resolve, reject) => {
      const timeoutMs = 4000;
      let timer = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        delete window.__initGoogleMapsCallback;
      };

      timer = setTimeout(() => {
        cleanup();
        googleMapsScriptPromise = null;
        reject(new Error('TIMEOUT: Tempo limite de 4000ms excedido ao carregar Google Maps.'));
      }, timeoutMs);

      window.__initGoogleMapsCallback = () => {
        cleanup();
        resolve(window.google);
      };

      const script = document.createElement('script');
      script.id = 'google-maps-js-sdk';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey.trim())}&libraries=geometry&callback=__initGoogleMapsCallback`;
      script.async = true;
      script.defer = true;

      script.onerror = () => {
        cleanup();
        googleMapsScriptPromise = null;
        reject(new Error('NETWORK_ERROR: Falha de rede ao carregar o script do Google Maps.'));
      };

      document.head.appendChild(script);
    });

    return googleMapsScriptPromise;
  }

  /**
   * Installs global gm_authFailure trap.
   */
  installAuthFailureTrap() {
    const prevAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      console.warn('[GoogleAdapter] Intercepted window.gm_authFailure. Triggering graceful fallback to Leaflet.');
      this.authFailureTriggered = true;

      // Dismiss any native error popup Google may have injected
      this.dismissGoogleErrorPopups();

      if (typeof prevAuthFailure === 'function') {
        try { prevAuthFailure(); } catch (e) {}
      }

      if (this.onFallback) {
        this.onFallback('AUTH_FAILURE');
      }
    };
  }

  dismissGoogleErrorPopups() {
    const errorContainers = document.querySelectorAll('.gm-err-container, .dismissButton');
    errorContainers.forEach(el => {
      const parentModal = el.closest('.gm-err-modal') || el;
      if (parentModal) parentModal.remove();
    });
  }

  /**
   * Initializes the Google Map.
   */
  async init(containerId, initialCenter = { lat: -23.5505, lng: -46.6333 }, zoom = 14) {
    this.containerId = containerId;
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`GoogleAdapter: Container element '#${containerId}' not found.`);
    }

    this.installAuthFailureTrap();

    try {
      await GoogleAdapter.loadGoogleScript(this.apiKey);
    } catch (err) {
      console.warn(`[GoogleAdapter] Load failed: ${err.message}. Triggering fallback.`);
      if (this.onFallback) {
        const code = err.message.split(':')[0].trim();
        this.onFallback(code);
      }
      throw err;
    }

    if (this.authFailureTriggered) {
      throw new Error('AUTH_FAILURE: Chave de API recusada pelo Google Maps.');
    }

    container.innerHTML = '';

    const google = window.google;
    this.map = new google.maps.Map(container, {
      center: { lat: initialCenter.lat, lng: initialCenter.lng },
      zoom: zoom,
      disableDefaultUI: true, // Clean minimalist UI
      zoomControl: true,
      zoomControlOptions: {
        position: google.maps.ControlPosition.RIGHT_BOTTOM
      },
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
        { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
        { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] }
      ]
    });

    // Map click handler
    this.map.addListener('click', (event) => {
      const coord = { lat: event.latLng.lat(), lng: event.latLng.lng() };
      this.clickHandlers.forEach(handler => handler(coord));
    });
  }

  setCenter(center, zoom) {
    if (!this.map) return;
    this.map.setCenter({ lat: center.lat, lng: center.lng });
    if (typeof zoom === 'number') {
      this.map.setZoom(zoom);
    }
  }

  getCenter() {
    if (!this.map) return { lat: 0, lng: 0 };
    const center = this.map.getCenter();
    return { lat: center.lat(), lng: center.lng() };
  }

  getZoom() {
    if (!this.map) return 14;
    return this.map.getZoom();
  }

  createSvgPinUrl(label = '', color = '#10B981') {
    const svg = `
      <svg width="34" height="44" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 0C7.611 0 0 7.611 0 17C0 29.75 17 44 17 44C17 44 34 29.75 34 17C34 7.611 26.389 0 17 0Z" fill="${color}"/>
        <circle cx="17" cy="17" r="12" fill="#FFFFFF"/>
        <text x="17" y="22" text-anchor="middle" fill="${color}" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="14">${label}</text>
      </svg>
    `.trim();

    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  addMarker(id, position, options = {}) {
    if (!this.map) return;
    this.removeMarker(id);

    const google = window.google;
    const color = options.color || (id === 'start' ? '#10B981' : (id === 'finish' ? '#EF4444' : '#3B82F6'));
    const label = options.label || (id === 'start' ? 'A' : (id === 'finish' ? 'B' : ''));

    const marker = new google.maps.Marker({
      position: { lat: position.lat, lng: position.lng },
      map: this.map,
      title: options.label || id,
      draggable: Boolean(options.draggable),
      icon: {
        url: this.createSvgPinUrl(label, color),
        scaledSize: new google.maps.Size(34, 44),
        anchor: new google.maps.Point(17, 44)
      },
      zIndex: id === 'finish' ? 1000 : 900
    });

    if (options.draggable) {
      marker.addListener('drag', (e) => {
        const newPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        const handlers = this.dragHandlers.get(id);
        if (handlers) handlers.forEach(h => h(newPos));
      });
      marker.addListener('dragend', (e) => {
        const newPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        const handlers = this.dragHandlers.get(id);
        if (handlers) handlers.forEach(h => h(newPos));
      });
    }

    this.markers.set(id, marker);
  }

  removeMarker(id) {
    if (this.markers.has(id)) {
      const marker = this.markers.get(id);
      marker.setMap(null);
      this.markers.delete(id);
    }
  }

  updateMarkerPosition(id, position) {
    const marker = this.markers.get(id);
    if (marker) {
      marker.setPosition({ lat: position.lat, lng: position.lng });
    }
  }

  renderPolyline(id, points, options = {}) {
    if (!this.map || !points || points.length === 0) return;
    this.removePolyline(id);

    const google = window.google;
    const path = points.map(p => ({ lat: p.lat, lng: p.lng }));

    const polyline = new google.maps.Polyline({
      path: path,
      geodesic: true,
      strokeColor: options.color || '#3B82F6',
      strokeOpacity: options.opacity !== undefined ? options.opacity : 0.8,
      strokeWeight: options.weight || 6,
      zIndex: options.zIndex || 10,
      map: this.map
    });

    this.polylines.set(id, polyline);
  }

  removePolyline(id) {
    if (this.polylines.has(id)) {
      const poly = this.polylines.get(id);
      poly.setMap(null);
      this.polylines.delete(id);
    }
  }

  fitBounds(points, padding = [50, 50]) {
    if (!this.map || !points || points.length === 0) return;
    const google = window.google;
    const bounds = new google.maps.LatLngBounds();
    points.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));

    this.map.fitBounds(bounds, {
      top: padding[0],
      bottom: padding[0],
      left: padding[1],
      right: padding[1]
    });
  }

  onMapClick(handler) {
    this.clickHandlers.add(handler);
  }

  onMarkerDrag(id, handler) {
    if (!this.dragHandlers.has(id)) {
      this.dragHandlers.set(id, new Set());
    }
    this.dragHandlers.get(id).add(handler);
  }

  destroy() {
    this.clickHandlers.clear();
    this.dragHandlers.clear();

    if (this.map) {
      if (window.google && window.google.maps && window.google.maps.event) {
        window.google.maps.event.clearInstanceListeners(this.map);
      }
      this.map = null;
    }

    this.markers.forEach(m => m.setMap(null));
    this.markers.clear();
    this.polylines.forEach(p => p.setMap(null));
    this.polylines.clear();

    const container = document.getElementById(this.containerId);
    if (container) {
      container.innerHTML = '';
    }
  }
}
