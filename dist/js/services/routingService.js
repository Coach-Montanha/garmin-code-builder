/**
 * @file routingService.js
 * @description Running Route Calculation & Distance Tracing Engine.
 * Features:
 *  - OSRM Foot Routing Client with GeoJSON coordinate normalization.
 *  - Client-side Haversine geodesic calculation with 1.25 urban circuity scaling.
 *  - Great Circle SLERP waypoint interpolation for smooth offline polylines.
 *  - Running duration estimator (default 5:30 min/km).
 *  - Address search & reverse geocoding integration (Komoot Photon).
 */

const OSRM_FOOT_BASE_URL = 'https://router.project-osrm.org/route/v1/foot';
const PHOTON_SEARCH_URL = 'https://photon.komoot.io/api/';
const PHOTON_REVERSE_URL = 'https://photon.komoot.io/reverse';

const EARTH_RADIUS_KM = 6371.0088;
const URBAN_CIRCUITY_FACTOR = 1.25;
const DEFAULT_RUNNING_PACE_SEC_PER_KM = 330; // 5:30 min/km

/**
 * Calculates geodesic distance between two points in kilometers via the Haversine formula.
 * Includes antimeridian boundary normalization.
 * 
 * @param {{ lat: number, lng: number }} p1 - Start coordinates.
 * @param {{ lat: number, lng: number }} p2 - Finish coordinates.
 * @returns {number} Distance in kilometers.
 */
export function calculateHaversineDistance(p1, p2) {
  if (!p1 || !p2) return 0;
  if (p1.lat === p2.lat && p1.lng === p2.lng) return 0;

  const toRad = deg => (deg * Math.PI) / 180;
  
  let diffLng = p2.lng - p1.lng;
  while (diffLng > 180) diffLng -= 360;
  while (diffLng < -180) diffLng += 360;

  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(diffLng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  
  return EARTH_RADIUS_KM * c;
}

/**
 * Generates intermediate coordinates between two points along the Great Circle arc (SLERP).
 * 
 * @param {{ lat: number, lng: number }} p1 - Start point.
 * @param {{ lat: number, lng: number }} p2 - Finish point.
 * @param {number} [numPoints=20] - Number of segments (resulting in numPoints+1 coordinates).
 * @returns {Array<{ lat: number, lng: number }>} Array of interpolated coordinates.
 */
export function interpolateGeodesicPath(p1, p2, numPoints = 20) {
  if (!p1 || !p2) return [];
  if (p1.lat === p2.lat && p1.lng === p2.lng) {
    return [{ lat: p1.lat, lng: p1.lng }];
  }

  const toRad = deg => (deg * Math.PI) / 180;
  const toDeg = rad => (rad * 180) / Math.PI;

  const lat1 = toRad(p1.lat);
  const lng1 = toRad(p1.lng);
  const lat2 = toRad(p2.lat);
  const lng2 = toRad(p2.lng);

  let diffLng = lng2 - lng1;
  while (diffLng > Math.PI) diffLng -= 2 * Math.PI;
  while (diffLng < -Math.PI) diffLng += 2 * Math.PI;

  const dLat = lat2 - lat1;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(diffLng / 2) ** 2;
  const delta = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));

  if (delta === 0 || isNaN(delta)) {
    return [{ lat: p1.lat, lng: p1.lng }];
  }

  const points = [];
  const steps = Math.max(2, numPoints);

  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const sinDelta = Math.sin(delta);
    const A = Math.sin((1 - f) * delta) / sinDelta;
    const B = Math.sin(f * delta) / sinDelta;

    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng1 + diffLng);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng1 + diffLng);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);

    const latF = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lngF = Math.atan2(y, x);

    let finalLng = toDeg(lngF);
    while (finalLng > 180) finalLng -= 360;
    while (finalLng < -180) finalLng += 360;

    points.push({
      lat: Number(toDeg(latF).toFixed(6)),
      lng: Number(finalLng.toFixed(6))
    });
  }

  // Ensure exact endpoints
  points[0] = { lat: p1.lat, lng: p1.lng };
  points[points.length - 1] = { lat: p2.lat, lng: p2.lng };

  return points;
}

/**
 * Normalizes OSRM GeoJSON coordinate array [[lng, lat], ...] to [{ lat, lng }, ...].
 * 
 * @param {Array<[number, number]>} coordinates 
 * @returns {Array<{ lat: number, lng: number }>}
 */
export function parseOsrmGeoJson(coordinates) {
  if (!Array.isArray(coordinates)) return [];
  return coordinates.map(([lng, lat]) => ({
    lat: Number(lat),
    lng: Number(lng)
  }));
}

/**
 * Formats duration in seconds to standard running time string (mm:ss or hh:mm:ss).
 * 
 * @param {number} totalSeconds 
 * @returns {string} Formatted duration.
 */
export function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  const pad = n => (n < 10 ? '0' : '') + n;
  if (h > 0) {
    return `${h}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

/**
 * Cleanly formats OpenStreetMap properties into a readable street, district, and city string.
 * @param {Object} properties 
 * @returns {string} Formatted address string
 */
export function formatPhotonProperties(properties) {
  if (!properties) return '';

  const { name, street, housenumber, district, suburb, city, town, village, state, country } = properties;
  const parts = [];

  // 1. Street and house number or primary place name
  if (name) {
    let primary = name;
    if (housenumber && !name.includes(housenumber)) {
      primary += `, ${housenumber}`;
    }
    parts.push(primary);
  } else if (street) {
    parts.push(housenumber ? `${street}, ${housenumber}` : street);
  }

  // 2. District / Neighborhood / Suburb
  const neighborhood = district || suburb;
  if (neighborhood && !parts.includes(neighborhood)) {
    parts.push(neighborhood);
  }

  // 3. City / Municipality
  const municipality = city || town || village;
  if (municipality && !parts.includes(municipality)) {
    parts.push(municipality);
  }

  // 4. Fallback if empty
  if (parts.length === 0) {
    if (state) parts.push(state);
    if (country) parts.push(country);
  }

  return parts.join(', ');
}

/**
 * Service implementing IRoutingService.
 */
export class RoutingService {
  /**
   * @param {Object} [options]
   * @param {number} [options.timeoutMs=4000] - OSRM fetch timeout in milliseconds.
   * @param {number} [options.circuityFactor=1.25] - Urban circuity multiplier for fallback.
   * @param {number} [options.runningPaceSec=330] - Default runner pace (sec/km).
   * @param {string} [options.osrmBaseUrl]
   * @param {string} [options.photonSearchUrl]
   * @param {string} [options.photonReverseUrl]
   */
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs || 4000;
    this.circuityFactor = options.circuityFactor || URBAN_CIRCUITY_FACTOR;
    this.runningPaceSec = options.runningPaceSec || DEFAULT_RUNNING_PACE_SEC_PER_KM;
    this.osrmBaseUrl = options.osrmBaseUrl || OSRM_FOOT_BASE_URL;
    this.photonSearchUrl = options.photonSearchUrl || PHOTON_SEARCH_URL;
    this.photonReverseUrl = options.photonReverseUrl || PHOTON_REVERSE_URL;
  }

  /**
   * Calculates pedestrian running route between start and finish.
   * Attempts OSRM Foot routing first; on any failure/timeout, executes Haversine + 1.25 circuity fallback.
   * 
   * @param {{ lat: number, lng: number }} start 
   * @param {{ lat: number, lng: number }} finish 
   * @returns {Promise<RouteResult>}
   */
  async calculateRoute(start, finish) {
    if (!start || !finish) {
      throw new Error('Start and Finish coordinates are required.');
    }

    // Zero-distance edge case
    if (start.lat === finish.lat && start.lng === finish.lng) {
      return {
        points: [{ lat: start.lat, lng: start.lng }],
        distanceKm: 0,
        estimatedDurationSec: 0,
        source: 'fallback'
      };
    }

    // Attempt OSRM Foot API if online
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      try {
        const result = await this._fetchOsrmFootRoute(start, finish);
        if (result) return result;
      } catch (err) {
        console.warn(`[RoutingService] OSRM routing failed (${err.message}). Using resilient Haversine fallback.`);
      }
    }

    // Resilient offline / error fallback
    return this._calculateFallbackRoute(start, finish);
  }

  /**
   * Internal fetch client for OSRM Foot API with AbortController timeout.
   * @private
   */
  async _fetchOsrmFootRoute(start, finish) {
    const coords = `${start.lng},${start.lat};${finish.lng},${finish.lat}`;
    const url = `${this.osrmBaseUrl}/${coords}?overview=full&geometries=geojson&steps=false`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error(`OSRM status code: ${data.code || 'NO_ROUTES'}`);
      }

      const bestRoute = data.routes[0];
      const rawCoords = bestRoute.geometry?.coordinates;
      if (!Array.isArray(rawCoords) || rawCoords.length < 2) {
        throw new Error('Invalid or empty geometry coordinates');
      }

      const points = parseOsrmGeoJson(rawCoords);
      const distanceMeters = Number(bestRoute.distance) || 0;
      const distanceKm = Number((distanceMeters / 1000).toFixed(2));
      const estimatedDurationSec = Math.round(distanceKm * this.runningPaceSec);

      return {
        points,
        distanceKm,
        estimatedDurationSec,
        source: 'osrm'
      };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /**
   * Internal client-side fallback using Haversine geodesic * 1.25 circuity factor + SLERP interpolation.
   * @private
   */
  _calculateFallbackRoute(start, finish) {
    const geodesicKm = calculateHaversineDistance(start, finish);
    const distanceKm = Number((geodesicKm * this.circuityFactor).toFixed(2));
    const estimatedDurationSec = Math.round(distanceKm * this.runningPaceSec);

    // Compute sample count proportional to distance
    const pointCount = Math.max(15, Math.min(50, Math.round(distanceKm * 5)));
    const points = interpolateGeodesicPath(start, finish, pointCount);

    return {
      points,
      distanceKm,
      estimatedDurationSec,
      source: 'fallback'
    };
  }

  /**
   * Forward geocoding via Komoot Photon API.
   * @param {string} query 
   * @param {Object} [options]
   * @returns {Promise<Array<{ label: string, position: { lat: number, lng: number }, raw?: Object }>>}
   */
  async searchAddress(query, options = {}) {
    const trimmed = query ? query.trim() : '';
    if (!trimmed || trimmed.length < 2) {
      return [];
    }

    const limit = options.limit || 5;
    let url = `${this.photonSearchUrl}?q=${encodeURIComponent(trimmed)}&limit=${limit}`;

    if (options.bias && typeof options.bias.lat === 'number' && typeof options.bias.lng === 'number') {
      url += `&lat=${options.bias.lat}&lon=${options.bias.lng}`;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: options.signal,
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Photon geocoding HTTP error: ${response.status}`);
      }

      const data = await response.json();
      if (!data || !Array.isArray(data.features)) {
        return [];
      }

      return data.features.map(feature => {
        const [lon, lat] = feature.geometry.coordinates;
        return {
          label: formatPhotonProperties(feature.properties) || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          position: { lat, lng: lon },
          raw: feature.properties
        };
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw err;
      }
      console.warn('[RoutingService] Address search error:', err.message);
      return [];
    }
  }

  /**
   * Reverse geocoding via Komoot Photon API.
   * Falls back gracefully to formatted coordinate string.
   * @param {{ lat: number, lng: number }} position 
   * @param {Object} [options]
   * @returns {Promise<string>}
   */
  async reverseGeocode(position, options = {}) {
    if (!position) return '';
    const defaultCoords = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
    const url = `${this.photonReverseUrl}?lat=${position.lat}&lon=${position.lng}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: options.signal,
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        return defaultCoords;
      }

      const data = await response.json();
      if (data && Array.isArray(data.features) && data.features.length > 0) {
        const address = formatPhotonProperties(data.features[0].properties);
        return address || defaultCoords;
      }

      return defaultCoords;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw err;
      }
      console.warn('[RoutingService] Reverse geocode fallback:', err.message);
      return defaultCoords;
    }
  }
}

export const routingService = new RoutingService();
export const geocodingService = routingService;
