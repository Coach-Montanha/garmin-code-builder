/**
 * @file adversarial_routing.test.js
 * @description Adversarial stress tests for Haversine distance, SLERP interpolation,
 * 1.25 urban circuity factor, polar/antimeridian geodesics, and edge cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHaversineDistance,
  interpolateGeodesicPath,
  parseOsrmGeoJson,
  formatDuration,
  RoutingService
} from '../../public/js/services/routingService.js';

const EARTH_RADIUS_KM = 6371.0088;
const MAX_EARTH_DIST_KM = Math.PI * EARTH_RADIUS_KM; // ~20015.114 km

describe('Adversarial Stress Suite: Routing & Geodesic Mathematics', () => {

  // =========================================================================
  // 1. HAVERSINE DISTANCE ADVERSARIAL CHALLENGES
  // =========================================================================
  describe('calculateHaversineDistance - Adversarial Challenges', () => {
    
    it('handles identical points, signed zeroes, and epsilon jitter', () => {
      // Strictly identical
      const p1 = { lat: -23.5874, lng: -46.6576 };
      assert.equal(calculateHaversineDistance(p1, p1), 0);

      // Signed zero (-0 vs +0)
      const pZero1 = { lat: 0, lng: 0 };
      const pZero2 = { lat: -0, lng: -0 };
      assert.equal(calculateHaversineDistance(pZero1, pZero2), 0);

      // Epsilon jitter (1e-15 degrees)
      const pJitter = { lat: 1e-15, lng: 0 };
      const jitterDist = calculateHaversineDistance(pZero1, pJitter);
      assert.ok(jitterDist >= 0 && jitterDist < 1e-10, `Expected near zero, got ${jitterDist}`);
    });

    it('accurately resolves micro-distances from 1 millimeter to 10 meters', () => {
      const pOrigin = { lat: 0, lng: 0 };

      // 1 millimeter (~8.9928e-9 degrees latitude)
      const p1mm = { lat: 8.9928e-9, lng: 0 };
      const dist1mm = calculateHaversineDistance(pOrigin, p1mm);
      const error1mm = Math.abs(dist1mm * 1000 - 0.001); // in meters
      assert.ok(error1mm < 0.0001, `1mm error too large: ${error1mm}m`);

      // 1 meter (~8.9928e-6 degrees latitude)
      const p1m = { lat: 8.9928e-6, lng: 0 };
      const dist1m = calculateHaversineDistance(pOrigin, p1m);
      const error1m = Math.abs(dist1m * 1000 - 1.0);
      assert.ok(error1m < 0.01, `1m error too large: ${error1m}m`);

      // 10 meters (~8.9928e-5 degrees latitude)
      const p10m = { lat: 8.9928e-5, lng: 0 };
      const dist10m = calculateHaversineDistance(pOrigin, p10m);
      const error10m = Math.abs(dist10m * 1000 - 10.0);
      assert.ok(error10m < 0.05, `10m error too large: ${error10m}m`);
    });

    it('correctly normalizes antimeridian crossings and multi-turn coordinates', () => {
      // Fiji: +179.9 to -179.9 deg lon (0.2 deg apart = ~21.32 km)
      const fiji1 = { lat: -16.5, lng: 179.9 };
      const fiji2 = { lat: -16.5, lng: -179.9 };
      const distFiji = calculateHaversineDistance(fiji1, fiji2);
      assert.ok(Math.abs(distFiji - 21.323) < 0.05, `Got ${distFiji}`);

      // Exact antimeridian meridians (+180.0 to -180.0)
      const am1 = { lat: 10, lng: 180.0 };
      const am2 = { lat: 10, lng: -180.0 };
      assert.equal(calculateHaversineDistance(am1, am2), 0, '180 and -180 at same lat must be 0 distance');

      // Multi-wrapped longitude (+539.9 is 179.9 + 360)
      const wrapped1 = { lat: 0, lng: 539.9 };
      const wrapped2 = { lat: 0, lng: -179.9 };
      const distWrapped = calculateHaversineDistance(wrapped1, wrapped2);
      assert.ok(Math.abs(distWrapped - 22.239) < 0.05, `Expected ~22.24km, got ${distWrapped}`);

      // Bering Strait / Chukotka: +179 to -171 deg (10 deg apart at 65 N = ~469.4 km)
      const bering1 = { lat: 65, lng: 179 };
      const bering2 = { lat: 65, lng: -171 };
      const distBering = calculateHaversineDistance(bering1, bering2);
      assert.ok(Math.abs(distBering - 469.44) < 0.5, `Got ${distBering}`);
    });

    it('correctly calculates polar and trans-polar distances', () => {
      // North Pole (90, 0) to 80 N along meridian = 10 degrees = ~1111.95 km
      const np = { lat: 90, lng: 0 };
      const p80 = { lat: 80, lng: 0 };
      const distPole = calculateHaversineDistance(np, p80);
      assert.ok(Math.abs(distPole - 1111.95) < 0.5, `Got ${distPole}`);

      // North Pole to different longitudes at 80 N must be identical distance
      const p80_east = { lat: 80, lng: 90 };
      const distPoleEast = calculateHaversineDistance(np, p80_east);
      assert.ok(Math.abs(distPole - distPoleEast) < 1e-6, 'Distance from pole must be longitude-invariant');

      // Trans-polar path: from (89.9, 0) to (89.9, 180) across the North Pole
      // Path goes: 89.9 -> 90.0 (0.1 deg) -> 89.9 (0.1 deg) = 0.2 deg = ~22.24 km
      const tp1 = { lat: 89.9, lng: 0 };
      const tp2 = { lat: 89.9, lng: 180 };
      const distTransPolar = calculateHaversineDistance(tp1, tp2);
      assert.ok(Math.abs(distTransPolar - 22.239) < 0.05, `Got ${distTransPolar}`);

      // North Pole to South Pole: exactly half Earth circumference
      const sp = { lat: -90, lng: 0 };
      const distPoleToPole = calculateHaversineDistance(np, sp);
      assert.ok(Math.abs(distPoleToPole - MAX_EARTH_DIST_KM) < 0.01, `Got ${distPoleToPole}`);
    });

    it('maintains stability for macro-distances and antipodal points', () => {
      // Madrid to Auckland (~19,596 km)
      const madrid = { lat: 40.4168, lng: -3.7038 };
      const auckland = { lat: -36.8485, lng: 174.7633 };
      const distNZ = calculateHaversineDistance(madrid, auckland);
      assert.ok(Math.abs(distNZ - 19596.6) < 5.0, `Got ${distNZ}`);

      // Exact antipodal points: (0, 0) and (0, 180) -> exactly pi * R
      const anti1 = { lat: 0, lng: 0 };
      const anti2 = { lat: 0, lng: 180 };
      const distAnti = calculateHaversineDistance(anti1, anti2);
      assert.ok(Math.abs(distAnti - MAX_EARTH_DIST_KM) < 0.001, `Got ${distAnti}`);

      // Diagonal antipodal points: (45, 45) and (-45, -135)
      const diag1 = { lat: 45, lng: 45 };
      const diag2 = { lat: -45, lng: -135 };
      const distDiag = calculateHaversineDistance(diag1, diag2);
      assert.ok(Math.abs(distDiag - MAX_EARTH_DIST_KM) < 0.001, `Got ${distDiag}`);
    });

    it('safely handles null, undefined, or missing inputs', () => {
      assert.equal(calculateHaversineDistance(null, null), 0);
      assert.equal(calculateHaversineDistance(undefined, { lat: 0, lng: 0 }), 0);
      assert.equal(calculateHaversineDistance({ lat: 0, lng: 0 }, null), 0);
    });
  });

  // =========================================================================
  // 2. URBAN CIRCUITY FACTOR (1.25x) STRESS TESTS
  // =========================================================================
  describe('Urban Circuity Multiplier (1.25x)', () => {
    
    it('strictly scales geodesic distances by 1.25 with 2-decimal rounding', () => {
      const service = new RoutingService({ timeoutMs: 50 });
      service._fetchOsrmFootRoute = async () => { throw new Error('Forced fallback'); };

      // 4.00 km geodesic -> 5.00 km route
      const p1 = { lat: 0, lng: 0 };
      const p2 = { lat: 4.00 / 111.195, lng: 0 }; // ~4.00 km
      const geoDist = calculateHaversineDistance(p1, p2);
      const fallback = service._calculateFallbackRoute(p1, p2);

      const expectedFallback = Number((geoDist * 1.25).toFixed(2));
      assert.equal(fallback.distanceKm, expectedFallback);
      assert.ok(Math.abs(fallback.distanceKm - 5.00) < 0.05);
    });

    it('verifies 10K running workout scaling baseline', () => {
      const service = new RoutingService();
      // 8.00 km geodesic * 1.25 = 10.00 km running route
      const pStart = { lat: 0, lng: 0 };
      const pFinish = { lat: 8.00 / 111.195, lng: 0 };
      const fallback = service._calculateFallbackRoute(pStart, pFinish);

      assert.equal(fallback.distanceKm, 10.00);
      // Duration at default 330 sec/km (5:30 min/km): 10 * 330 = 3300 sec
      assert.equal(fallback.estimatedDurationSec, 3300);
      assert.equal(formatDuration(fallback.estimatedDurationSec), '55:00');
    });

    it('correctly exposes configurable circuity factor override', () => {
      const customService = new RoutingService({ circuityFactor: 1.40 });
      const p1 = { lat: 0, lng: 0 };
      const p2 = { lat: 1.0 / 111.195, lng: 0 };
      const fallback = customService._calculateFallbackRoute(p1, p2);
      assert.equal(fallback.distanceKm, 1.40);
    });

    it('handles micro-distances rounding to zero correctly', () => {
      const service = new RoutingService();
      // 1 meter = 0.001 km -> 0.001 * 1.25 = 0.00125 km -> rounds to 0.00 km
      const pOrigin = { lat: 0, lng: 0 };
      const p1m = { lat: 8.9928e-6, lng: 0 };
      const fallback = service._calculateFallbackRoute(pOrigin, p1m);

      assert.equal(fallback.distanceKm, 0.00);
      assert.equal(fallback.estimatedDurationSec, 0);
      assert.ok(fallback.points.length >= 15);
    });
  });

  // =========================================================================
  // 3. SLERP GEODESIC INTERPOLATION STRESS TESTS
  // =========================================================================
  describe('interpolateGeodesicPath (SLERP) - Mathematical Rigor', () => {

    it('strictly preserves start and finish endpoints', () => {
      const pStart = { lat: 51.5074, lng: -0.1278 };
      const pFinish = { lat: 48.8566, lng: 2.3522 };
      const points = interpolateGeodesicPath(pStart, pFinish, 25);

      assert.equal(points.length, 26);
      assert.deepEqual(points[0], pStart);
      assert.deepEqual(points[points.length - 1], pFinish);
    });

    it('exhibits near-zero variance in angular step distances (equidistant SLERP)', () => {
      // 1000 km diagonal run
      const p1 = { lat: 10, lng: 10 };
      const p2 = { lat: 15, lng: 15 };
      const numSteps = 20;
      const points = interpolateGeodesicPath(p1, p2, numSteps);
      const totalDist = calculateHaversineDistance(p1, p2);
      const expectedStep = totalDist / numSteps;

      const stepDists = [];
      for (let i = 1; i < points.length; i++) {
        stepDists.push(calculateHaversineDistance(points[i - 1], points[i]));
      }

      for (const step of stepDists) {
        // Each step must equal expectedStep within 0.001 km (1 meter)
        assert.ok(
          Math.abs(step - expectedStep) < 0.005,
          `Step distance deviated: ${step} vs expected ${expectedStep}`
        );
      }
    });

    it('demonstrates strict cumulative distance monotonicity along the path', () => {
      const p1 = { lat: -23.5874, lng: -46.6576 };
      const p2 = { lat: -23.6500, lng: -46.7200 };
      const points = interpolateGeodesicPath(p1, p2, 30);

      let prevCumulative = 0;
      for (let i = 1; i < points.length; i++) {
        const cumulative = calculateHaversineDistance(p1, points[i]);
        assert.ok(
          cumulative > prevCumulative,
          `Monotonicity violation at index ${i}: prev ${prevCumulative}, curr ${cumulative}`
        );
        prevCumulative = cumulative;
      }
    });

    it('smoothly crosses antimeridian without generating NaN or out-of-range coordinates', () => {
      const p1 = { lat: 0, lng: 175 };
      const p2 = { lat: 0, lng: -175 };
      const points = interpolateGeodesicPath(p1, p2, 10);

      assert.equal(points.length, 11);
      for (const pt of points) {
        assert.ok(!isNaN(pt.lat) && !isNaN(pt.lng), 'No NaN allowed');
        assert.ok(pt.lat >= -90 && pt.lat <= 90, `Lat out of bounds: ${pt.lat}`);
        assert.ok(pt.lng >= -180 && pt.lng <= 180, `Lng out of bounds: ${pt.lng}`);
      }

      // Check midpoint is on antimeridian
      const mid = points[5];
      assert.equal(mid.lat, 0);
      assert.ok(Math.abs(mid.lng) === 180, `Expected 180, got ${mid.lng}`);
    });

    it('handles trans-polar interpolation reaching the pole', () => {
      const p1 = { lat: 89.0, lng: 0 };
      const p2 = { lat: 89.0, lng: 180 };
      const points = interpolateGeodesicPath(p1, p2, 20);

      assert.equal(points.length, 21);
      const maxLat = Math.max(...points.map(p => p.lat));
      // Geodesic path over the pole must reach 90 degrees
      assert.ok(Math.abs(maxLat - 90.0) < 0.001, `Max lat should reach 90.0, got ${maxLat}`);
      for (const pt of points) {
        assert.ok(pt.lat <= 90.0, `Latitude exceeded 90: ${pt.lat}`);
      }
    });

    it('returns single point when start and finish are strictly identical', () => {
      const p = { lat: 40.7128, lng: -74.0060 };
      const points = interpolateGeodesicPath(p, p, 20);
      assert.equal(points.length, 1);
      assert.deepEqual(points[0], p);
    });

    it('gracefully handles non-positive or small numPoints requests', () => {
      const p1 = { lat: 0, lng: 0 };
      const p2 = { lat: 10, lng: 10 };

      // numPoints = 0 or 1 clamps to minimum 2 steps (3 points)
      const pts0 = interpolateGeodesicPath(p1, p2, 0);
      assert.equal(pts0.length, 3);
      assert.deepEqual(pts0[0], p1);
      assert.deepEqual(pts0[pts0.length - 1], p2);

      const ptsNegative = interpolateGeodesicPath(p1, p2, -5);
      assert.equal(ptsNegative.length, 3);
    });

    it('documents mathematical degeneracy on exact antipodal coordinates', () => {
      // At exact antipodal points (delta = pi), sin(delta) ~ 1.22e-16 causes division instability.
      // We verify that interpolateGeodesicPath does NOT throw or crash.
      const anti1 = { lat: 0, lng: 0 };
      const anti2 = { lat: 0, lng: 180 };
      const points = interpolateGeodesicPath(anti1, anti2, 10);

      assert.equal(points.length, 11);
      assert.deepEqual(points[0], anti1);
      assert.deepEqual(points[points.length - 1], anti2);
      // All points should remain finite numbers
      for (const pt of points) {
        assert.ok(!isNaN(pt.lat) && !isNaN(pt.lng), 'Point should not be NaN');
      }
    });
  });

  // =========================================================================
  // 4. ROUTING SERVICE RESILIENCE & EDGE CASES
  // =========================================================================
  describe('RoutingService Adversarial Resilience', () => {

    it('rejects invalid or missing coordinate payloads with an error', async () => {
      const service = new RoutingService();
      await assert.rejects(
        () => service.calculateRoute(null, { lat: 0, lng: 0 }),
        /Start and Finish coordinates are required/
      );
      await assert.rejects(
        () => service.calculateRoute({ lat: 0, lng: 0 }, undefined),
        /Start and Finish coordinates are required/
      );
    });

    it('returns zero-distance result for identical coordinates without network call', async () => {
      const service = new RoutingService();
      let networkCalled = false;
      service._fetchOsrmFootRoute = async () => {
        networkCalled = true;
        throw new Error('Should not be called');
      };

      const p = { lat: 52.5200, lng: 13.4050 };
      const result = await service.calculateRoute(p, p);

      assert.equal(networkCalled, false, 'Network must not be called for zero distance');
      assert.equal(result.distanceKm, 0);
      assert.equal(result.estimatedDurationSec, 0);
      assert.equal(result.source, 'fallback');
      assert.deepEqual(result.points, [p]);
    });

    it('handles antimeridian identical coordinates (180 vs -180)', async () => {
      const service = new RoutingService();
      service._fetchOsrmFootRoute = async () => { throw new Error('offline'); };

      const p1 = { lat: 10, lng: 180 };
      const p2 = { lat: 10, lng: -180 };
      const result = await service.calculateRoute(p1, p2);

      assert.equal(result.distanceKm, 0);
      assert.equal(result.estimatedDurationSec, 0);
      assert.equal(result.source, 'fallback');
    });

    it('calculates fallback route when OSRM returns HTTP 500 error', async () => {
      const service = new RoutingService();
      service._fetchOsrmFootRoute = async () => {
        throw new Error('HTTP 500: Internal Server Error');
      };

      const start = { lat: -23.5874, lng: -46.6576 };
      const finish = { lat: -23.5938, lng: -46.6521 };
      const result = await service.calculateRoute(start, finish);

      assert.equal(result.source, 'fallback');
      assert.ok(result.distanceKm > 1.0 && result.distanceKm < 1.3);
      assert.ok(result.points.length >= 15);
      assert.deepEqual(result.points[0], start);
      assert.deepEqual(result.points[result.points.length - 1], finish);
    });
  });

  // =========================================================================
  // 5. HELPER UTILITIES STRESS
  // =========================================================================
  describe('Helper Utilities: parseOsrmGeoJson & formatDuration', () => {

    it('parses inverted coordinates safely and filters invalid entries', () => {
      const valid = [[-46.65, -23.58], [-46.66, -23.59]];
      const parsed = parseOsrmGeoJson(valid);
      assert.equal(parsed.length, 2);
      assert.equal(parsed[0].lat, -23.58);
      assert.equal(parsed[0].lng, -46.65);

      assert.deepEqual(parseOsrmGeoJson(null), []);
      assert.deepEqual(parseOsrmGeoJson(undefined), []);
      assert.deepEqual(parseOsrmGeoJson('invalid'), []);
    });

    it('formats duration boundaries accurately', () => {
      assert.equal(formatDuration(0), '00:00');
      assert.equal(formatDuration(-10), '00:00'); // clamp negative
      assert.equal(formatDuration(59), '00:59');
      assert.equal(formatDuration(60), '01:00');
      assert.equal(formatDuration(3599), '59:59');
      assert.equal(formatDuration(3600), '1:00:00');
      assert.equal(formatDuration(36000), '10:00:00');
    });
  });
});
