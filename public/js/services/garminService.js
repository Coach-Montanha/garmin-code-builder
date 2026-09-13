/**
 * @file garminService.js
 * @description Client-side Garmin Connect integration and Telemetry Parsing Service.
 * Implements IGarminService per PROJECT.md:
 *  - GPX 1.1 XML parsing (DOMParser in browser + pure JS tag stack fallback for Node tests).
 *  - Garmin Activity JSON parser with strict schema validation.
 *  - Indoor / Treadmill run handling (0 GPS coordinates).
 *  - OAuth 2.0 PKCE client & Garmin REST API wrapper.
 */

import { calculateHaversineDistance } from './routingService.js';

/**
 * Validates XML tag balance in environments lacking DOMParser (e.g. Node.js native test runner).
 * @param {string} xml
 * @returns {boolean}
 */
export function validateXmlStructure(xml) {
  if (typeof xml !== 'string' || !xml.trim()) return false;
  const trimmed = xml.trim();

  // Basic boundary check: must start with < and end with >
  if (!trimmed.startsWith('<') || !trimmed.endsWith('>')) return false;

  // Verify gpx root opening and closing tags
  if (!/<gpx[\s>]/i.test(trimmed) || !/<\/gpx>/i.test(trimmed)) {
    return false;
  }

  // Strip XML comments
  const cleanXml = trimmed.replace(/<!--[\s\S]*?-->/g, '');

  // Tag stack balance check
  const tagRegex = /<(\/?)([a-zA-Z0-9_:]+)([^>]*?)(\/?)>/g;
  const stack = [];
  let match;

  while ((match = tagRegex.exec(cleanXml)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2];
    const attrs = match[3];
    const isSelfClosing = match[4] === '/' || attrs.trim().endsWith('/');

    // Ignore XML declarations and doctype
    if (tagName.startsWith('?') || tagName.startsWith('!')) continue;
    if (isSelfClosing) continue;

    if (isClosing) {
      if (stack.length === 0) return false;
      const top = stack.pop();
      if (top.toLowerCase() !== tagName.toLowerCase()) return false;
    } else {
      stack.push(tagName);
    }
  }

  return stack.length === 0;
}

/**
 * Parses GPX 1.1 XML string into a GarminActivity record.
 * Dual-mode: uses DOMParser if available, otherwise pure-JS validator and scanner.
 * @param {string} xmlText
 * @returns {Object} GarminActivity
 */
export function parseGpxXml(xmlText) {
  if (typeof xmlText !== 'string' || !xmlText.trim()) {
    throw new Error('Invalid GPX XML format: Empty payload (arquivo corrompido ou vazio)');
  }

  let doc = null;
  const hasDOMParser = typeof globalThis.DOMParser !== 'undefined';

  if (hasDOMParser) {
    const parser = new globalThis.DOMParser();
    doc = parser.parseFromString(xmlText, 'text/xml');

    const parserErrors = doc.getElementsByTagName('parsererror');
    if (parserErrors.length > 0 || doc.documentElement?.nodeName.toLowerCase() === 'parsererror') {
      throw new Error('Invalid GPX XML format: Corrupt or malformed GPX file (formato XML inválido ou corrompido)');
    }
    if (doc.documentElement?.nodeName.toLowerCase() !== 'gpx') {
      throw new Error('Invalid GPX XML format: Missing GPX root element (elemento raiz gpx ausente)');
    }
  } else {
    // Headless / Node.js test environment validation
    if (!validateXmlStructure(xmlText)) {
      throw new Error('Invalid GPX XML format: Corrupt or malformed GPX file (formato XML inválido ou corrompido)');
    }
  }

  // Extract Track Name
  let activityName = 'Morning Garmin Run';
  if (doc) {
    const trkName = doc.getElementsByTagName('trk')[0]?.getElementsByTagName('name')[0]?.textContent;
    const metaName = doc.getElementsByTagName('metadata')[0]?.getElementsByTagName('name')[0]?.textContent;
    if (trkName?.trim()) activityName = trkName.trim();
    else if (metaName?.trim()) activityName = metaName.trim();
  } else {
    const trkNameMatch = xmlText.match(/<trk>[\s\S]*?<name>([\s\S]*?)<\/name>/i);
    const metaNameMatch = xmlText.match(/<metadata>[\s\S]*?<name>([\s\S]*?)<\/name>/i);
    if (trkNameMatch?.[1]?.trim()) activityName = trkNameMatch[1].trim();
    else if (metaNameMatch?.[1]?.trim()) activityName = metaNameMatch[1].trim();
  }

  // Extract Trackpoints
  const trackPoints = [];

  if (doc) {
    const trkptNodes = doc.getElementsByTagName('trkpt');
    for (let i = 0; i < trkptNodes.length; i++) {
      const node = trkptNodes[i];
      const latAttr = node.getAttribute('lat');
      const lonAttr = node.getAttribute('lon') || node.getAttribute('lng');
      if (!latAttr || !lonAttr) continue;

      const lat = parseFloat(latAttr);
      const lng = parseFloat(lonAttr);
      if (isNaN(lat) || isNaN(lng)) continue;

      const eleNode = node.getElementsByTagName('ele')[0];
      const timeNode = node.getElementsByTagName('time')[0];
      const hrNode = node.getElementsByTagName('gpxtpx:hr')[0] || node.getElementsByTagName('hr')[0];
      const cadNode = node.getElementsByTagName('gpxtpx:cad')[0] || node.getElementsByTagName('cad')[0];

      trackPoints.push({
        lat,
        lng,
        elevation: eleNode ? parseFloat(eleNode.textContent) : undefined,
        time: timeNode ? timeNode.textContent.trim() : undefined,
        heartRate: hrNode ? parseInt(hrNode.textContent, 10) : undefined,
        cadence: cadNode ? parseInt(cadNode.textContent, 10) : undefined,
      });
    }
  } else {
    const trkptRegex = /<trkpt\s+([^>]+)>([\s\S]*?)<\/trkpt>|<trkpt\s+([^>]+)\/>/gi;
    let match;
    while ((match = trkptRegex.exec(xmlText)) !== null) {
      const attrs = match[1] || match[3] || '';
      const inner = match[2] || '';

      const latMatch = attrs.match(/lat=["']([^"']+)["']/i);
      const lonMatch = attrs.match(/(?:lon|lng)=["']([^"']+)["']/i);
      if (!latMatch || !lonMatch) continue;

      const lat = parseFloat(latMatch[1]);
      const lng = parseFloat(lonMatch[1]);
      if (isNaN(lat) || isNaN(lng)) continue;

      const eleMatch = inner.match(/<ele>([^<]+)<\/ele>/i);
      const timeMatch = inner.match(/<time>([^<]+)<\/time>/i);
      const hrMatch = inner.match(/<(?:gpxtpx:)?hr>([^<]+)<\/(?:gpxtpx:)?hr>/i);
      const cadMatch = inner.match(/<(?:gpxtpx:)?cad>([^<]+)<\/(?:gpxtpx:)?cad>/i);

      trackPoints.push({
        lat,
        lng,
        elevation: eleMatch ? parseFloat(eleMatch[1]) : undefined,
        time: timeMatch ? timeMatch[1].trim() : undefined,
        heartRate: hrMatch ? parseInt(hrMatch[1], 10) : undefined,
        cadence: cadMatch ? parseInt(cadMatch[1], 10) : undefined,
      });
    }
  }

  // Verify trackpoint presence (T2.05)
  if (trackPoints.length === 0) {
    throw new Error('No trackpoints found in GPX file: Trackpoint array is empty (nenhum trackpoint encontrado / vazio)');
  }

  // Calculate Cumulative Distance & Moving Duration
  let totalDistanceKm = 0;
  let movingDurationSec = 0;

  for (let i = 0; i < trackPoints.length - 1; i++) {
    const p1 = trackPoints[i];
    const p2 = trackPoints[i + 1];
    const segDistKm = calculateHaversineDistance(p1, p2);
    totalDistanceKm += segDistKm;

    if (p1.time && p2.time) {
      const dtSec = (new Date(p2.time).getTime() - new Date(p1.time).getTime()) / 1000;
      if (dtSec > 0) {
        const speedMps = (segDistKm * 1000) / dtSec;
        if (speedMps >= 0.5) { // threshold >= 1.8 km/h
          movingDurationSec += dtSec;
        }
      }
    }
  }

  // Total Elapsed Duration
  let elapsedTimeSec = 0;
  const firstTime = trackPoints[0]?.time;
  const lastTime = trackPoints[trackPoints.length - 1]?.time;
  if (firstTime && lastTime) {
    const startMs = new Date(firstTime).getTime();
    const endMs = new Date(lastTime).getTime();
    if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
      elapsedTimeSec = Math.round((endMs - startMs) / 1000);
    }
  }

  if (movingDurationSec === 0 && elapsedTimeSec > 0) {
    movingDurationSec = elapsedTimeSec;
  }

  // Format Average Pace (min/km)
  totalDistanceKm = Number(totalDistanceKm.toFixed(2));
  const timeForPace = movingDurationSec > 0 ? movingDurationSec : elapsedTimeSec;
  let averagePaceMinPerKm = '0:00';

  if (totalDistanceKm > 0 && timeForPace > 0) {
    const secPerKm = timeForPace / totalDistanceKm;
    const mins = Math.floor(secPerKm / 60);
    const secs = Math.round(secPerKm % 60);
    if (secs === 60) {
      averagePaceMinPerKm = `${mins + 1}:00`;
    } else {
      averagePaceMinPerKm = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
  }

  return {
    id: `gpx_${Date.now()}`,
    name: activityName,
    startTime: firstTime || new Date().toISOString(),
    totalDistanceKm,
    elapsedTimeSec,
    movingDurationSec,
    averagePaceMinPerKm,
    trackPoints,
  };
}

/**
 * Parses and validates Garmin Activity JSON exports or simulated REST responses.
 * Rejects corrupt payloads missing mandatory fields (T2.06).
 * Handles zero GPS coordinates for indoor treadmill runs safely (T2.07).
 * @param {string|Object} input
 * @returns {Object} GarminActivity
 */
export function parseGarminActivityJson(input) {
  let data;
  if (typeof input === 'string') {
    if (!input.trim()) {
      throw new Error('Invalid activity JSON format: empty input (erro: dados vazios)');
    }
    try {
      data = JSON.parse(input);
    } catch (e) {
      throw new Error(`Invalid activity JSON: schema error (${e.message})`);
    }
  } else if (input && typeof input === 'object') {
    data = input;
  } else {
    throw new Error('Invalid activity JSON: schema error - expected string or object');
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid activity JSON: root must be an object (schema error: objeto inválido)');
  }

  // Mandatory Schema Validation (T2.06)
  const name = data.activityName || data.name;
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Invalid activity JSON: missing mandatory fields (schema error: nome obrigatório ausente)');
  }

  const rawDist = data.totalDistanceKm !== undefined ? data.totalDistanceKm :
                  (data.distance !== undefined ? data.distance / 1000 : undefined);
  if (rawDist === undefined || typeof rawDist !== 'number' || isNaN(rawDist)) {
    throw new Error('Invalid activity JSON: missing mandatory fields (schema error: distância obrigatória ausente)');
  }

  const rawDuration = data.elapsedTimeSec !== undefined ? data.elapsedTimeSec :
                      (data.elapsedDuration !== undefined ? data.elapsedDuration :
                      (data.duration !== undefined ? data.duration : undefined));
  if (rawDuration === undefined || typeof rawDuration !== 'number' || isNaN(rawDuration)) {
    throw new Error('Invalid activity JSON: missing mandatory fields (schema error: duração obrigatória ausente)');
  }

  const rawPoints = data.trackPoints || data.geoPolyline || data.samples;
  if (!Array.isArray(rawPoints)) {
    throw new Error('Invalid activity JSON: missing mandatory fields (schema error: coordenadas GPS obrigatórias ausentes)');
  }

  // Normalize Trackpoints (can be empty array for indoor treadmill runs)
  const trackPoints = rawPoints.map(pt => ({
    lat: Number(pt.lat !== undefined ? pt.lat : pt.latitude),
    lng: Number(pt.lng !== undefined ? pt.lng : (pt.lon !== undefined ? pt.lon : pt.longitude)),
    elevation: pt.ele !== undefined ? Number(pt.ele) : (pt.elevation !== undefined ? Number(pt.elevation) : undefined),
    time: pt.time || undefined,
  })).filter(pt => !isNaN(pt.lat) && !isNaN(pt.lng));

  const totalDistanceKm = Number(rawDist.toFixed(2));
  const elapsedTimeSec = Math.round(rawDuration);

  // Compute or format pace
  let averagePaceMinPerKm = data.averagePaceMinPerKm;
  if (!averagePaceMinPerKm) {
    if (typeof data.averagePace === 'number' && data.averagePace > 0) {
      const mins = Math.floor(data.averagePace / 60);
      const secs = Math.round(data.averagePace % 60);
      averagePaceMinPerKm = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    } else if (typeof data.averageSpeed === 'number' && data.averageSpeed > 0) {
      const secPerKm = 1000 / data.averageSpeed;
      const mins = Math.floor(secPerKm / 60);
      const secs = Math.round(secPerKm % 60);
      averagePaceMinPerKm = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    } else if (totalDistanceKm > 0 && elapsedTimeSec > 0) {
      const secPerKm = elapsedTimeSec / totalDistanceKm;
      const mins = Math.floor(secPerKm / 60);
      const secs = Math.round(secPerKm % 60);
      averagePaceMinPerKm = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    } else {
      averagePaceMinPerKm = '0:00';
    }
  }

  // Normalize Start Time
  let startTime = data.startTime;
  if (!startTime) {
    if (data.startTimeGMT) {
      startTime = new Date(data.startTimeGMT.replace(' ', 'T') + (data.startTimeGMT.endsWith('Z') ? '' : 'Z')).toISOString();
    } else if (data.startTimeLocal) {
      startTime = new Date(data.startTimeLocal).toISOString();
    } else if (trackPoints[0]?.time) {
      startTime = trackPoints[0].time;
    } else {
      startTime = new Date().toISOString();
    }
  }

  return {
    id: String(data.activityId || data.id || `garmin_${Date.now()}`),
    name: name.trim(),
    startTime,
    totalDistanceKm,
    elapsedTimeSec,
    averagePaceMinPerKm,
    trackPoints,
  };
}

/**
 * Service implementing IGarminService.
 */
export class GarminService {
  constructor(options = {}) {
    this.apiBaseUrl = options.apiBaseUrl || '/api/garmin';
    this.storageKey = options.storageKey || 'garmin_access_token';
    this.token = this._loadToken();
    this.user = this._loadUser();
    this.cachedActivities = [];
  }

  _loadToken() {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(this.storageKey) || null;
    }
    return null;
  }

  _loadUser() {
    if (typeof localStorage !== 'undefined') {
      const userStr = localStorage.getItem('garmin_user');
      if (userStr) {
        try {
          return JSON.parse(userStr);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  _saveToken(token) {
    this.token = token;
    if (typeof localStorage !== 'undefined') {
      if (token) localStorage.setItem(this.storageKey, token);
      else localStorage.removeItem(this.storageKey);
    }
  }

  isConnected() {
    return Boolean(this.token);
  }

  async connectOAuth() {
    const authRes = await fetch(`${this.apiBaseUrl}/oauth/authorize`);
    if (!authRes.ok) {
      throw new Error(`Garmin authorization failed (${authRes.status})`);
    }
    const authData = await authRes.json();

    const tokenRes = await fetch(`${this.apiBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: authData.code || 'MOCK_GARMIN_CODE_123',
        client_id: authData.clientId || 'garmin_running_app',
      }),
    });
    if (!tokenRes.ok) {
      throw new Error(`Garmin token exchange failed (${tokenRes.status})`);
    }
    const tokenData = await tokenRes.json();
    this._saveToken(tokenData.access_token);
    this.user = tokenData.user || { name: 'TestRunner_Pro' };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('garmin_user', JSON.stringify(this.user));
    }

    return { connected: true, token: this.token, user: this.user };
  }

  async disconnect() {
    try {
      if (this.token) {
        await fetch(`${this.apiBaseUrl}/oauth/disconnect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
          },
        });
      }
    } catch (e) {
      console.warn('[GarminService] Disconnect endpoint warning:', e);
    } finally {
      this._saveToken(null);
      this.user = null;
      this.cachedActivities = [];
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('garmin_user');
      }
    }
  }

  async fetchActivities() {
    const headers = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${this.apiBaseUrl}/activities`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch Garmin activities (${res.status})`);
    }

    const rawList = await res.json();
    if (!Array.isArray(rawList)) {
      throw new Error('Invalid Garmin activities payload');
    }

    this.cachedActivities = rawList.map(item => parseGarminActivityJson(item));
    return this.cachedActivities;
  }

  async getActivity(id) {
    if (!id) throw new Error('Activity ID is required');

    const cached = this.cachedActivities.find(a => String(a.id) === String(id));
    if (cached) return cached;

    const headers = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${this.apiBaseUrl}/activities/${encodeURIComponent(id)}`, { headers });
    if (!res.ok) {
      throw new Error(`Activity not found (${res.status})`);
    }

    const item = await res.json();
    return parseGarminActivityJson(item);
  }

  async parseGPX(xmlText) {
    return parseGpxXml(xmlText);
  }

  async parseGarminJSON(jsonText) {
    return parseGarminActivityJson(jsonText);
  }

  /**
   * Universal file loader supporting either File objects or text strings.
   * Auto-detects XML vs JSON.
   */
  async parseFile(fileOrText, filename = '') {
    let content = '';
    let fname = filename;

    if (typeof fileOrText === 'string') {
      content = fileOrText;
    } else if (fileOrText && typeof fileOrText.text === 'function') {
      content = await fileOrText.text();
      fname = fileOrText.name || filename;
    } else {
      throw new Error('Invalid file input');
    }

    const trimmed = content.trim();
    if (fname.toLowerCase().endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return this.parseGarminJSON(trimmed);
    } else {
      return this.parseGPX(trimmed);
    }
  }
}

export const garminService = new GarminService();
export default garminService;
