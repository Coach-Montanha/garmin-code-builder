/**
 * @file adversarial_stress_diagnostics.js
 * @description Adversarial stress harness and empirical data collector for routing mathematics.
 */

import {
  calculateHaversineDistance,
  interpolateGeodesicPath,
  parseOsrmGeoJson,
  formatDuration,
  RoutingService
} from '../../public/js/services/routingService.js';

const EARTH_RADIUS_KM = 6371.0088;

console.log('================================================================');
console.log('ADVERSARIAL STRESS HARNESS: ROUTING MATHEMATICS & GEODESIC MATH');
console.log('================================================================\n');

// -------------------------------------------------------------
// 1. Antimeridian Crossing Stress Tests
// -------------------------------------------------------------
console.log('--- 1. ANTIMERIDIAN CROSSING ---');
const antimeridianCases = [
  { name: 'Fiji (+179.9 to -179.9)', p1: { lat: -16.5, lng: 179.9 }, p2: { lat: -16.5, lng: -179.9 } },
  { name: 'Equator (+179.9 to -179.9)', p1: { lat: 0, lng: 179.9 }, p2: { lat: 0, lng: -179.9 } },
  { name: 'Equator (+180.0 to -180.0)', p1: { lat: 0, lng: 180.0 }, p2: { lat: 0, lng: -180.0 } },
  { name: 'Alaska-Chukotka (+179.0 to -171.0)', p1: { lat: 65.0, lng: 179.0 }, p2: { lat: 65.0, lng: -171.0 } },
  { name: 'Multi-wrap (+539.9 to -179.9)', p1: { lat: 0, lng: 539.9 }, p2: { lat: 0, lng: -179.9 } },
  { name: 'Near Antimeridian Asymmetric (+179.9999 to -179.9999)', p1: { lat: 10, lng: 179.9999 }, p2: { lat: 10, lng: -179.9999 } }
];

for (const c of antimeridianCases) {
  const dist = calculateHaversineDistance(c.p1, c.p2);
  const path = interpolateGeodesicPath(c.p1, c.p2, 10);
  const nanFound = path.some(pt => isNaN(pt.lat) || isNaN(pt.lng));
  const lats = path.map(p => p.lat);
  const lngs = path.map(p => p.lng);
  console.log(`[${c.name}] Dist: ${dist.toFixed(4)} km | Path count: ${path.length} | Has NaN: ${nanFound}`);
  console.log(`   Endpoints: start(${path[0].lat}, ${path[0].lng}) -> end(${path[path.length-1].lat}, ${path[path.length-1].lng})`);
  console.log(`   Midpoint: (${path[Math.floor(path.length/2)].lat}, ${path[Math.floor(path.length/2)].lng})`);
}

// -------------------------------------------------------------
// 2. Polar & High-Latitude Coordinates
// -------------------------------------------------------------
console.log('\n--- 2. POLAR & HIGH LATITUDES ---');
const polarCases = [
  { name: 'Exact North Pole (90, 0) to (80, 0)', p1: { lat: 90, lng: 0 }, p2: { lat: 80, lng: 0 } },
  { name: 'Exact North Pole (90, 0) to (80, 90)', p1: { lat: 90, lng: 0 }, p2: { lat: 80, lng: 90 } },
  { name: 'Trans-polar: (89.9, 0) to (89.9, 180)', p1: { lat: 89.9, lng: 0 }, p2: { lat: 89.9, lng: 180 } },
  { name: 'High Latitude East-West: (89.0, -170) to (89.0, 170)', p1: { lat: 89.0, lng: -170 }, p2: { lat: 89.0, lng: 170 } },
  { name: 'Exact South Pole (-90, 0) to (-80, 0)', p1: { lat: -90, lng: 0 }, p2: { lat: -80, lng: 0 } },
  { name: 'North Pole to South Pole (90, 0) to (-90, 0)', p1: { lat: 90, lng: 0 }, p2: { lat: -90, lng: 0 } },
  { name: 'Pole to Pole Antipodal (90, 0) to (-90, 180)', p1: { lat: 90, lng: 0 }, p2: { lat: -90, lng: 180 } }
];

for (const c of polarCases) {
  const dist = calculateHaversineDistance(c.p1, c.p2);
  const path = interpolateGeodesicPath(c.p1, c.p2, 10);
  const nanFound = path.some(pt => isNaN(pt.lat) || isNaN(pt.lng));
  const outOfBounds = path.some(pt => Math.abs(pt.lat) > 90 || Math.abs(pt.lng) > 180);
  console.log(`[${c.name}] Dist: ${dist.toFixed(4)} km | Path count: ${path.length} | Has NaN: ${nanFound} | Lat/Lng OOB: ${outOfBounds}`);
  console.log(`   Start: (${path[0].lat}, ${path[0].lng}) -> Mid: (${path[Math.floor(path.length/2)].lat}, ${path[Math.floor(path.length/2)].lng}) -> End: (${path[path.length-1].lat}, ${path[path.length-1].lng})`);
}

// -------------------------------------------------------------
// 3. Zero-Distance & Micro-Distances (< 1 meter)
// -------------------------------------------------------------
console.log('\n--- 3. ZERO-DISTANCE & MICRO-DISTANCES ---');
const microCases = [
  { name: 'Strictly Identical Coordinates', p1: { lat: 40.7128, lng: -74.0060 }, p2: { lat: 40.7128, lng: -74.0060 } },
  { name: 'Equator Zero Point (0, 0)', p1: { lat: 0, lng: 0 }, p2: { lat: 0, lng: 0 } },
  { name: 'Signed Zero (+0 vs -0)', p1: { lat: 0, lng: 0 }, p2: { lat: -0, lng: -0 } },
  { name: 'Sub-millimeter (1e-9 deg ~ 0.11 mm)', p1: { lat: 0, lng: 0 }, p2: { lat: 1e-9, lng: 0 } },
  { name: 'One Millimeter (8.99e-9 deg ~ 1.0 mm)', p1: { lat: 0, lng: 0 }, p2: { lat: 8.9928e-9, lng: 0 } },
  { name: 'One Centimeter (8.99e-8 deg ~ 1.0 cm)', p1: { lat: 0, lng: 0 }, p2: { lat: 8.9928e-8, lng: 0 } },
  { name: 'One Meter (8.99e-6 deg ~ 1.0 m)', p1: { lat: 0, lng: 0 }, p2: { lat: 8.9928e-6, lng: 0 } },
  { name: 'Ten Meters (8.99e-5 deg ~ 10.0 m)', p1: { lat: 0, lng: 0 }, p2: { lat: 8.9928e-5, lng: 0 } },
  { name: 'Epsilon Coordinate Jitter (1e-15 deg)', p1: { lat: 0, lng: 0 }, p2: { lat: 1e-15, lng: 0 } }
];

for (const c of microCases) {
  const distKm = calculateHaversineDistance(c.p1, c.p2);
  const distMeters = distKm * 1000;
  const path = interpolateGeodesicPath(c.p1, c.p2, 10);
  const nanFound = path.some(pt => isNaN(pt.lat) || isNaN(pt.lng));
  console.log(`[${c.name}] Dist: ${distMeters.toExponential(4)} m (${distKm.toExponential(4)} km) | Path count: ${path.length} | Has NaN: ${nanFound}`);
}

// -------------------------------------------------------------
// 4. Macro-Distances (>10,000 km) & Antipodal Stress
// -------------------------------------------------------------
console.log('\n--- 4. MACRO-DISTANCES & ANTIPODAL POINTS ---');
const macroCases = [
  { name: 'Madrid to Auckland (~19,600 km)', p1: { lat: 40.4168, lng: -3.7038 }, p2: { lat: -36.8485, lng: 174.7633 } },
  { name: 'London to Sydney (~17,000 km)', p1: { lat: 51.5074, lng: -0.1278 }, p2: { lat: -33.8688, lng: 151.2093 } },
  { name: 'Halfway Globe Equator (0, 0) to (0, 90) (~10,000 km)', p1: { lat: 0, lng: 0 }, p2: { lat: 0, lng: 90 } },
  { name: 'Near Antipodal (0, 0) to (0, 179.9999)', p1: { lat: 0, lng: 0 }, p2: { lat: 0, lng: 179.9999 } },
  { name: 'Exact Antipodal Equator (0, 0) to (0, 180)', p1: { lat: 0, lng: 0 }, p2: { lat: 0, lng: 180 } },
  { name: 'Exact Antipodal Diagonal (45, 45) to (-45, -135)', p1: { lat: 45, lng: 45 }, p2: { lat: -45, lng: -135 } }
];

for (const c of macroCases) {
  const dist = calculateHaversineDistance(c.p1, c.p2);
  const maxPossible = Math.PI * EARTH_RADIUS_KM;
  const path = interpolateGeodesicPath(c.p1, c.p2, 20);
  const nanFound = path.some(pt => isNaN(pt.lat) || isNaN(pt.lng));
  console.log(`[${c.name}] Dist: ${dist.toFixed(4)} km (Max Earth: ${maxPossible.toFixed(4)} km) | Path count: ${path.length} | Has NaN: ${nanFound}`);
  if (nanFound) {
    console.log('   WARNING: NaN points detected in path!');
    const badIdx = path.findIndex(pt => isNaN(pt.lat) || isNaN(pt.lng));
    console.log(`   First NaN at index ${badIdx}:`, path[badIdx]);
  }
}

// -------------------------------------------------------------
// 5. SLERP Interpolation Step Uniformity & Monotonicity
// -------------------------------------------------------------
console.log('\n--- 5. SLERP UNIFORMITY & MONOTONICITY ---');
function analyzeSlerpDistribution(p1, p2, numSteps = 20) {
  const path = interpolateGeodesicPath(p1, p2, numSteps);
  const totalDist = calculateHaversineDistance(p1, p2);
  const segmentDists = [];
  let cumulativeDist = 0;
  let isCumulativeMonotonic = true;
  let maxLatDeviation = 0;

  for (let i = 1; i < path.length; i++) {
    const d = calculateHaversineDistance(path[i - 1], path[i]);
    segmentDists.push(d);
    cumulativeDist += d;
  }

  const expectedStepDist = totalDist / numSteps;
  const meanStepDist = segmentDists.reduce((a, b) => a + b, 0) / segmentDists.length;
  const variance = segmentDists.reduce((acc, d) => acc + (d - meanStepDist) ** 2, 0) / segmentDists.length;
  const stdDev = Math.sqrt(variance);
  const ratioCumulativeToDirect = cumulativeDist / (totalDist || 1);

  return {
    totalDist,
    numPoints: path.length,
    expectedStepDist,
    meanStepDist,
    stdDev,
    cumulativeDist,
    ratioCumulativeToDirect
  };
}

const slerpCases = [
  { name: 'Equatorial 1000 km', p1: { lat: 0, lng: 0 }, p2: { lat: 0, lng: 8.9928 } },
  { name: 'Meridional 1000 km', p1: { lat: 0, lng: 0 }, p2: { lat: 8.9928, lng: 0 } },
  { name: 'Diagonal 45-degree 5000 km', p1: { lat: 10, lng: 10 }, p2: { lat: 40, lng: 60 } },
  { name: 'Antimeridian 1000 km', p1: { lat: 0, lng: 175 }, p2: { lat: 0, lng: -175 } },
  { name: 'High-Latitude 500 km', p1: { lat: 85, lng: 0 }, p2: { lat: 85, lng: 90 } }
];

for (const sc of slerpCases) {
  const stats = analyzeSlerpDistribution(sc.p1, sc.p2, 20);
  console.log(`[${sc.name}] Total: ${stats.totalDist.toFixed(2)} km | Step Expected: ${stats.expectedStepDist.toFixed(4)} km | Mean: ${stats.meanStepDist.toFixed(4)} km | StdDev: ${stats.stdDev.toExponential(4)} | Ratio (Cumul/Direct): ${stats.ratioCumulativeToDirect.toFixed(6)}`);
}

// -------------------------------------------------------------
// 6. Urban Circuity Factor (1.25x) & RoutingService Integration
// -------------------------------------------------------------
console.log('\n--- 6. CIRCUITY FACTOR (1.25x) & FALLBACK ORCHESTRATION ---');
const service = new RoutingService({ timeoutMs: 100 });
// Force fallback
service._fetchOsrmFootRoute = async () => { throw new Error('Forced offline'); };

const circuityTests = [
  { name: '5K Run (4.00 km straight line)', p1: { lat: -23.5874, lng: -46.6576 }, p2: { lat: -23.6234, lng: -46.6576 } },
  { name: '10K Run (8.00 km straight line)', p1: { lat: 0, lng: 0 }, p2: { lat: 0.07194, lng: 0 } },
  { name: 'Micro Run (10 meters)', p1: { lat: 0, lng: 0 }, p2: { lat: 8.9928e-5, lng: 0 } },
  { name: 'Zero Distance Run', p1: { lat: 40.7128, lng: -74.0060 }, p2: { lat: 40.7128, lng: -74.0060 } }
];

for (const ct of circuityTests) {
  const straightLine = calculateHaversineDistance(ct.p1, ct.p2);
  const route = await service.calculateRoute(ct.p1, ct.p2);
  const ratio = straightLine > 0 ? route.distanceKm / straightLine : 1;
  const expectedPaceDuration = Math.round(route.distanceKm * 330);
  console.log(`[${ct.name}] Straight: ${straightLine.toFixed(4)} km -> Fallback: ${route.distanceKm} km (Ratio: ${ratio.toFixed(4)}) | Duration: ${route.estimatedDurationSec}s (Fmt: ${formatDuration(route.estimatedDurationSec)}) | Points: ${route.points.length}`);
}

console.log('\n================================================================');
console.log('HARNESS COMPLETE');
console.log('================================================================');
