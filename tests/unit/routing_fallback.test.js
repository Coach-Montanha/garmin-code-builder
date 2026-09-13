/**
 * @file routing_fallback.test.js
 * @description Unit tests for Haversine distance, urban circuity factor, SLERP interpolation, and error fallback.
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

describe('Routing Engine & Geodesic Mathematics', () => {
  describe('calculateHaversineDistance', () => {
    it('returns 0 km for identical coordinates', () => {
      const p = { lat: -23.5874, lng: -46.6576 };
      const dist = calculateHaversineDistance(p, p);
      assert.equal(dist, 0);
    });

    it('accurately calculates London to Paris distance (~343.5 km)', () => {
      const pLondon = { lat: 51.5074, lng: -0.1278 };
      const pParis = { lat: 48.8566, lng: 2.3522 };
      const dist = calculateHaversineDistance(pLondon, pParis);
      // Expected: ~343.56 km (within 0.2 km error)
      assert.ok(Math.abs(dist - 343.56) < 0.2, `Expected ~343.56km, got ${dist}`);
    });

    it('correctly handles antimeridian crossing (Fiji +179.9 to -179.9)', () => {
      const fiji1 = { lat: -16.5, lng: 179.9 };
      const fiji2 = { lat: -16.5, lng: -179.9 };
      const dist = calculateHaversineDistance(fiji1, fiji2);
      // Over the date line: ~21.3 km (not ~39,000 km around the globe)
      assert.ok(dist < 25, `Expected <25km, got ${dist}`);
      assert.ok(Math.abs(dist - 21.32) < 0.2);
    });
  });

  describe('Urban Circuity Scaling (1.25x)', () => {
    it('scales geodesic distance by 1.25 multiplier', () => {
      const p1 = { lat: -23.5874, lng: -46.6576 };
      const p2 = { lat: -23.5938, lng: -46.6521 };
      const geoDist = calculateHaversineDistance(p1, p2);
      const scaledDist = geoDist * 1.25;

      assert.ok(Math.abs(geoDist - 0.906) < 0.01);
      assert.ok(Math.abs(scaledDist - 1.13) < 0.02);
    });
  });

  describe('interpolateGeodesicPath (SLERP)', () => {
    it('generates the specified number of intermediate points', () => {
      const p1 = { lat: -23.5874, lng: -46.6576 };
      const p2 = { lat: -23.5938, lng: -46.6521 };
      const points = interpolateGeodesicPath(p1, p2, 10);

      assert.equal(points.length, 11); // 10 steps = 11 points (start + 9 intermediate + finish)
      assert.deepEqual(points[0], p1);
      assert.deepEqual(points[points.length - 1], p2);
    });

    it('produces monotonically advancing coordinates', () => {
      const p1 = { lat: 10.0, lng: 10.0 };
      const p2 = { lat: 20.0, lng: 20.0 };
      const points = interpolateGeodesicPath(p1, p2, 20);

      for (let i = 1; i < points.length; i++) {
        assert.ok(points[i].lat > points[i - 1].lat, `Lat should increase at index ${i}`);
        assert.ok(points[i].lng > points[i - 1].lng, `Lng should increase at index ${i}`);
      }
    });

    it('returns single point when start and finish are identical', () => {
      const p = { lat: 40.7128, lng: -74.0060 };
      const points = interpolateGeodesicPath(p, p, 20);
      assert.equal(points.length, 1);
      assert.deepEqual(points[0], p);
    });
  });

  describe('parseOsrmGeoJson', () => {
    it('inverts [lng, lat] GeoJSON array to [{ lat, lng }]', () => {
      const osrmCoords = [
        [-46.656655, -23.587761],
        [-46.652091, -23.593726]
      ];
      const parsed = parseOsrmGeoJson(osrmCoords);

      assert.equal(parsed.length, 2);
      assert.equal(parsed[0].lat, -23.587761);
      assert.equal(parsed[0].lng, -46.656655);
      assert.equal(parsed[1].lat, -23.593726);
      assert.equal(parsed[1].lng, -46.652091);
    });

    it('handles empty or malformed inputs safely', () => {
      assert.deepEqual(parseOsrmGeoJson(null), []);
      assert.deepEqual(parseOsrmGeoJson([]), []);
    });
  });

  describe('formatDuration', () => {
    it('formats seconds into mm:ss format', () => {
      assert.equal(formatDuration(352), '05:52');
      assert.equal(formatDuration(65), '01:05');
      assert.equal(formatDuration(0), '00:00');
    });

    it('formats hours into h:mm:ss format', () => {
      assert.equal(formatDuration(3665), '1:01:05');
      assert.equal(formatDuration(7200), '2:00:00');
    });
  });

  describe('RoutingService Fallback Resilience', () => {
    it('transparently falls back to Haversine + 1.25 circuity on invalid endpoint or network failure', async () => {
      // Configure service with invalid URL to force failure
      const service = new RoutingService({ timeoutMs: 200 });
      // Temporarily override private fetcher to simulate network error
      service._fetchOsrmFootRoute = async () => {
        throw new Error('Network offline or rate limit');
      };

      const start = { lat: -23.5874, lng: -46.6576 };
      const finish = { lat: -23.5938, lng: -46.6521 };

      const result = await service.calculateRoute(start, finish);

      assert.equal(result.source, 'fallback');
      assert.ok(result.distanceKm > 1.0 && result.distanceKm < 1.3);
      assert.ok(result.points.length >= 15);
      assert.deepEqual(result.points[0], start);
      assert.deepEqual(result.points[result.points.length - 1], finish);
      assert.ok(result.estimatedDurationSec > 0);
    });

    it('handles zero distance cleanly', async () => {
      const service = new RoutingService();
      const p = { lat: -23.5874, lng: -46.6576 };
      const result = await service.calculateRoute(p, p);

      assert.equal(result.distanceKm, 0);
      assert.equal(result.estimatedDurationSec, 0);
      assert.equal(result.points.length, 1);
      assert.equal(result.source, 'fallback');
    });
  });
});
