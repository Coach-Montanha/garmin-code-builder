/**
 * LeafletAdapter — Implementation of IMapAdapter for Leaflet v1.9.4
 * Zero-dependency, keyless, high-contrast CartoDB Positron / OSM basemap.
 */

export class LeafletAdapter {
  constructor() {
    this.map = null;
    this.containerId = null;
    this.markers = new Map(); // id -> L.Marker
    this.polylines = new Map(); // id -> L.Polyline
    this.clickHandlers = new Set();
    this.dragHandlers = new Map(); // id -> Set<Function>
    this.tileLayer = null;
    this.isDestroyed = false;
  }

  getProviderName() {
    return 'leaflet';
  }

  /**
   * Initializes the Leaflet map in the specified container.
   * @param {string} containerId - DOM ID of the container element
   * @param {{ lat: number, lng: number }} initialCenter
   * @param {number} zoom
   */
  async init(containerId, initialCenter = { lat: -23.5505, lng: -46.6333 }, zoom = 14) {
    this.containerId = containerId;
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`LeafletAdapter: Container element '#${containerId}' not found.`);
    }

    // Defensive cleanup: remove stale Leaflet internal ID if container was previously mounted
    if (container._leaflet_id) {
      delete container._leaflet_id;
    }
    container.innerHTML = '';

    // Verify window.L is loaded
    const L = window.L;
    if (!L) {
      throw new Error('LeafletAdapter: Leaflet library (window.L) is not loaded.');
    }

    // Create Leaflet Map instance
    this.map = L.map(containerId, {
      center: [initialCenter.lat, initialCenter.lng],
      zoom: zoom,
      zoomControl: false, // Mount custom placement at bottomright
      attributionControl: true
    });

    // Add zoom control at bottom-right to avoid HUD overlays
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Primary Tile Layer: CartoDB Positron
    this.mountTileLayer();

    // Map click handler
    this.map.on('click', (event) => {
      const coord = { lat: event.latlng.lat, lng: event.latlng.lng };
      this.clickHandlers.forEach(handler => handler(coord));
    });

    // Invalidate size once rendered into layout
    setTimeout(() => {
      if (this.map) this.map.invalidateSize();
    }, 100);

    this.isDestroyed = false;
  }

  mountTileLayer() {
    const L = window.L;
    const osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    this.tileLayer = L.tileLayer(osmUrl, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    });

    this.tileLayer.addTo(this.map);
  }

  setCenter(center, zoom) {
    if (!this.map) return;
    if (typeof zoom === 'number') {
      this.map.setView([center.lat, center.lng], zoom);
    } else {
      this.map.panTo([center.lat, center.lng]);
    }
  }

  getCenter() {
    if (!this.map) return { lat: 0, lng: 0 };
    const center = this.map.getCenter();
    return { lat: center.lat, lng: center.lng };
  }

  getZoom() {
    if (!this.map) return 14;
    return this.map.getZoom();
  }

  /**
   * Generates a crisp SVG pin icon without external image asset dependencies.
   */
  createSvgIcon(label = '', color = '#10B981') {
    const L = window.L;
    const svgHtml = `
      <div class="map-marker-pin" style="--pin-color: ${color}">
        <svg width="34" height="44" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg" class="marker-svg">
          <path d="M17 0C7.611 0 0 7.611 0 17C0 29.75 17 44 17 44C17 44 34 29.75 34 17C34 7.611 26.389 0 17 0Z" fill="${color}" filter="drop-shadow(0 3px 6px rgba(0,0,0,0.35))"/>
          <circle cx="17" cy="17" r="12" fill="#FFFFFF"/>
          <text x="17" y="22" text-anchor="middle" fill="${color}" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="14">${label}</text>
        </svg>
      </div>
    `;

    return L.divIcon({
      className: 'custom-leaflet-marker',
      html: svgHtml,
      iconSize: [34, 44],
      iconAnchor: [17, 44],
      popupAnchor: [0, -40]
    });
  }

  addMarker(id, position, options = {}) {
    if (!this.map) return;
    this.removeMarker(id);

    const L = window.L;
    const color = options.color || (id === 'start' ? '#10B981' : (id === 'finish' ? '#EF4444' : '#3B82F6'));
    const label = options.label || (id === 'start' ? 'A' : (id === 'finish' ? 'B' : '•'));
    const icon = this.createSvgIcon(label, color);

    const marker = L.marker([position.lat, position.lng], {
      draggable: Boolean(options.draggable),
      icon: icon,
      title: options.label || id,
      zIndexOffset: id === 'finish' ? 1000 : 900
    });

    marker.addTo(this.map);

    // Marker drag tracking
    if (options.draggable) {
      marker.on('drag', (e) => {
        const latlng = (e && e.latlng) || (marker.getLatLng ? marker.getLatLng() : (e && e.target && e.target.getLatLng ? e.target.getLatLng() : null));
        if (!latlng) return;
        const newPos = { lat: latlng.lat, lng: latlng.lng };
        const handlers = this.dragHandlers.get(id);
        if (handlers) {
          handlers.forEach(h => h(newPos));
        }
      });
      marker.on('dragend', (e) => {
        const latlng = (e && e.latlng) || (marker.getLatLng ? marker.getLatLng() : (e && e.target && e.target.getLatLng ? e.target.getLatLng() : null));
        if (!latlng) return;
        const newPos = { lat: latlng.lat, lng: latlng.lng };
        const handlers = this.dragHandlers.get(id);
        if (handlers) {
          handlers.forEach(h => h(newPos));
        }
      });
    }

    this.markers.set(id, marker);
  }

  removeMarker(id) {
    if (this.markers.has(id)) {
      const marker = this.markers.get(id);
      marker.remove();
      this.markers.delete(id);
    }
  }

  updateMarkerPosition(id, position) {
    const marker = this.markers.get(id);
    if (marker) {
      marker.setLatLng([position.lat, position.lng]);
    }
  }

  renderPolyline(id, points, options = {}) {
    if (!this.map || !points || points.length === 0) return;
    this.removePolyline(id);

    const L = window.L;
    const latLngs = points.map(p => [p.lat, p.lng]);

    const polyline = L.polyline(latLngs, {
      color: options.color || '#3B82F6',
      weight: options.weight || 6,
      opacity: options.opacity !== undefined ? options.opacity : 0.8,
      dashArray: options.dashArray || null,
      lineCap: 'round',
      lineJoin: 'round'
    });

    polyline.addTo(this.map);
    this.polylines.set(id, polyline);
  }

  removePolyline(id) {
    if (this.polylines.has(id)) {
      const poly = this.polylines.get(id);
      poly.remove();
      this.polylines.delete(id);
    }
  }

  fitBounds(points, padding = [50, 50]) {
    if (!this.map || !points || points.length === 0) return;
    const L = window.L;
    const latLngs = points.map(p => [p.lat, p.lng]);
    const bounds = L.latLngBounds(latLngs);
    this.map.fitBounds(bounds, {
      paddingTopLeft: [padding[0], padding[1]],
      paddingBottomRight: [padding[0], padding[1]],
      maxZoom: 16
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
    this.isDestroyed = true;
    this.clickHandlers.clear();
    this.dragHandlers.clear();

    if (this.map) {
      this.map.off();
      this.map.remove();
      this.map = null;
    }

    this.markers.clear();
    this.polylines.clear();

    const container = document.getElementById(this.containerId);
    if (container) {
      delete container._leaflet_id;
      container.innerHTML = '';
    }
  }
}
