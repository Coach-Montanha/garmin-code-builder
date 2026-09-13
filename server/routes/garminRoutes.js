/**
 * Garmin Connect Mock OAuth 2.0 PKCE & Activities REST API
 * Implements Features 14, 15, and 16.
 */

import { Router } from 'express';
import crypto from 'node:crypto';

const router = Router();

// In-memory state for PKCE codes & mock session
const authCodes = new Map();

let activeSession = {
  connected: false,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  user: null,
  scope: 'activity:read',
};

/**
 * Verify PKCE verifier against stored challenge (RFC 7636).
 * @param {string} verifier
 * @param {string} challenge
 * @param {string} method ('S256' | 'plain')
 * @returns {boolean}
 */
export function verifyPkce(verifier, challenge, method = 'S256') {
  if (!verifier || !challenge) return false;
  if (method === 'plain') return verifier === challenge;
  if (method === 'S256') {
    const computed = crypto.createHash('sha256').update(verifier).digest('base64url');
    return computed === challenge;
  }
  return false;
}

/**
 * Reset mock state (useful for automated testing).
 */
export function resetMockSession() {
  authCodes.clear();
  activeSession = {
    connected: false,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    user: null,
    scope: 'activity:read',
  };
}

/**
 * Pre-seeded workout library.
 */
export const PRESEEDED_ACTIVITIES = [
  // 1. Morning 5K Road Run (Matches tests/e2e/helpers.js line 191 & sample_5k.gpx)
  {
    id: 'garmin_act_5k',
    activityId: 1409283741,
    name: 'Morning 5K Road Run',
    activityName: 'Morning 5K Road Run',
    activityType: 'running',
    startTime: '2026-09-12T09:45:00Z',
    startTimeLocal: '2026-09-12 06:45:00',
    startTimeGMT: '2026-09-12 09:45:00',
    totalDistanceKm: 5.12,
    distance: 5120.5,
    elapsedTimeSec: 1560,
    elapsedDuration: 1560.0,
    movingDurationSec: 1530,
    movingDuration: 1515.0,
    duration: 1530.0,
    averagePaceMinPerKm: '4:59',
    averagePace: 298.8,
    averageSpeed: 3.34,
    elevationGain: 28.0,
    startLatitude: -23.5874,
    startLongitude: -46.6576,
    trackPoints: [
      { lat: -23.5874, lng: -46.6576, ele: 760.0, elevation: 760.0, time: '2026-09-12T09:45:00Z' },
      { lat: -23.5860, lng: -46.6580, ele: 761.5, elevation: 761.5, time: '2026-09-12T09:48:30Z' },
      { lat: -23.5845, lng: -46.6588, ele: 762.0, elevation: 762.0, time: '2026-09-12T09:52:00Z' },
      { lat: -23.5830, lng: -46.6595, ele: 761.0, elevation: 761.0, time: '2026-09-12T09:56:00Z' },
      { lat: -23.5818, lng: -46.6601, ele: 760.5, elevation: 760.5, time: '2026-09-12T10:00:30Z' },
    ],
    geoPolyline: [
      { lat: -23.5874, lng: -46.6576, ele: 760.0, time: '2026-09-12T09:45:00Z' },
      { lat: -23.5860, lng: -46.6580, ele: 761.5, time: '2026-09-12T09:48:30Z' },
      { lat: -23.5845, lng: -46.6588, ele: 762.0, time: '2026-09-12T09:52:00Z' },
      { lat: -23.5830, lng: -46.6595, ele: 761.0, time: '2026-09-12T09:56:00Z' },
      { lat: -23.5818, lng: -46.6601, ele: 760.5, time: '2026-09-12T10:00:30Z' },
    ],
  },

  // 2. Weekend 10K Tempo (Matches tests/e2e/helpers.js line 207)
  {
    id: 'garmin_act_10k',
    activityId: 1409283742,
    name: 'Weekend 10K Tempo',
    activityName: 'Weekend 10K Tempo',
    activityType: 'running',
    startTime: '2026-09-10T08:00:00Z',
    startTimeLocal: '2026-09-10 05:00:00',
    startTimeGMT: '2026-09-10 08:00:00',
    totalDistanceKm: 10.05,
    distance: 10050.0,
    elapsedTimeSec: 3015,
    elapsedDuration: 3015.0,
    movingDurationSec: 2980,
    movingDuration: 2980.0,
    duration: 2980.0,
    averagePaceMinPerKm: '5:00',
    averagePace: 300.0,
    averageSpeed: 3.33,
    elevationGain: 65.0,
    startLatitude: -23.5874,
    startLongitude: -46.6576,
    trackPoints: [
      { lat: -23.5874, lng: -46.6576, ele: 760.0, elevation: 760.0, time: '2026-09-10T08:00:00Z' },
      { lat: -23.5820, lng: -46.6540, ele: 766.0, elevation: 766.0, time: '2026-09-10T08:12:30Z' },
      { lat: -23.5760, lng: -46.6490, ele: 778.0, elevation: 778.0, time: '2026-09-10T08:25:00Z' },
      { lat: -23.5700, lng: -46.6400, ele: 805.0, elevation: 805.0, time: '2026-09-10T08:38:00Z' },
      { lat: -23.5650, lng: -46.6520, ele: 815.0, elevation: 815.0, time: '2026-09-10T08:50:15Z' },
    ],
    geoPolyline: [
      { lat: -23.5874, lng: -46.6576, ele: 760.0, time: '2026-09-10T08:00:00Z' },
      { lat: -23.5820, lng: -46.6540, ele: 766.0, time: '2026-09-10T08:12:30Z' },
      { lat: -23.5760, lng: -46.6490, ele: 778.0, time: '2026-09-10T08:25:00Z' },
      { lat: -23.5700, lng: -46.6400, ele: 805.0, time: '2026-09-10T08:38:00Z' },
      { lat: -23.5650, lng: -46.6520, ele: 815.0, time: '2026-09-10T08:50:15Z' },
    ],
  },

  // 3. Half Marathon Sunday Long Run
  {
    id: 'garmin_act_21k',
    activityId: 1409283743,
    name: 'Half Marathon Sunday Long Run',
    activityName: 'Half Marathon Sunday Long Run',
    activityType: 'running',
    startTime: '2026-09-06T06:30:00Z',
    startTimeLocal: '2026-09-06 03:30:00',
    startTimeGMT: '2026-09-06 06:30:00',
    totalDistanceKm: 21.10,
    distance: 21100.0,
    elapsedTimeSec: 6540,
    elapsedDuration: 6540.0,
    movingDurationSec: 6480,
    movingDuration: 6480.0,
    duration: 6480.0,
    averagePaceMinPerKm: '5:10',
    averagePace: 310.0,
    averageSpeed: 3.23,
    elevationGain: 142.0,
    startLatitude: -23.5874,
    startLongitude: -46.6576,
    trackPoints: [
      { lat: -23.5874, lng: -46.6576, ele: 760.0, elevation: 760.0, time: '2026-09-06T06:30:00Z' },
      { lat: -23.5820, lng: -46.6540, ele: 766.0, elevation: 766.0, time: '2026-09-06T06:50:00Z' },
      { lat: -23.5760, lng: -46.6490, ele: 778.0, elevation: 778.0, time: '2026-09-06T07:15:00Z' },
      { lat: -23.5680, lng: -46.6420, ele: 810.0, elevation: 810.0, time: '2026-09-06T07:42:00Z' },
      { lat: -23.5580, lng: -46.6550, ele: 820.0, elevation: 820.0, time: '2026-09-06T08:05:00Z' },
      { lat: -23.5650, lng: -46.6620, ele: 795.0, elevation: 795.0, time: '2026-09-06T08:18:00Z' },
    ],
    geoPolyline: [
      { lat: -23.5874, lng: -46.6576, ele: 760.0, time: '2026-09-06T06:30:00Z' },
      { lat: -23.5820, lng: -46.6540, ele: 766.0, time: '2026-09-06T06:50:00Z' },
      { lat: -23.5760, lng: -46.6490, ele: 778.0, time: '2026-09-06T07:15:00Z' },
      { lat: -23.5680, lng: -46.6420, ele: 810.0, time: '2026-09-06T07:42:00Z' },
      { lat: -23.5580, lng: -46.6550, ele: 820.0, time: '2026-09-06T08:05:00Z' },
      { lat: -23.5650, lng: -46.6620, ele: 795.0, time: '2026-09-06T08:18:00Z' },
    ],
  },

  // 4. Indoor Treadmill 5K (Matches tier2_boundary_corner.spec.js T2.07: trackPoints: [])
  {
    id: 'indoor_treadmill_run',
    activityId: 1409283744,
    name: 'Indoor Treadmill 5K',
    activityName: 'Indoor Treadmill 5K',
    activityType: 'treadmill_running',
    startTime: '2026-09-12T07:00:00Z',
    startTimeLocal: '2026-09-12 04:00:00',
    startTimeGMT: '2026-09-12 07:00:00',
    totalDistanceKm: 5.0,
    distance: 5000.0,
    elapsedTimeSec: 1500,
    elapsedDuration: 1500.0,
    movingDurationSec: 1500,
    movingDuration: 1500.0,
    duration: 1500.0,
    averagePaceMinPerKm: '5:00',
    averagePace: 300.0,
    averageSpeed: 3.33,
    elevationGain: 0.0,
    startLatitude: null,
    startLongitude: null,
    trackPoints: [],
    geoPolyline: [],
  },
];

// --- ROUTES ---

// 1. Authorize: GET /oauth/authorize
router.get('/oauth/authorize', (req, res) => {
  const clientId = req.query.client_id || 'garmin_running_app';
  const redirectUri = req.query.redirect_uri || '/api/garmin/oauth/callback';
  const state = req.query.state || 'abc';
  const codeChallenge = req.query.code_challenge || null;
  const codeChallengeMethod = req.query.code_challenge_method || 'S256';

  const code = 'MOCK_GARMIN_CODE_123';

  authCodes.set(code, {
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    expiresAt: Date.now() + 600000, // 10 min
  });

  const authUrl = `${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;

  res.status(200).json({
    authUrl,
    clientId,
    code,
    state,
  });
});

// 2. Token Exchange: POST /oauth/token & GET /oauth/token
function handleTokenExchange(req, res) {
  const params = { ...req.query, ...req.body };
  const { grant_type = 'authorization_code', code, code_verifier } = params;

  if (grant_type === 'authorization_code') {
    if (!code) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Authorization code is required',
      });
    }

    const storedCode = authCodes.get(code);

    if (storedCode) {
      if (storedCode.expiresAt < Date.now()) {
        authCodes.delete(code);
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Authorization code has expired',
        });
      }

      if (storedCode.codeChallenge) {
        if (!code_verifier) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'PKCE code_verifier is required',
          });
        }
        const valid = verifyPkce(code_verifier, storedCode.codeChallenge, storedCode.codeChallengeMethod);
        if (!valid) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'PKCE verification failed: code_verifier does not match code_challenge',
          });
        }
      }
    } else if (code.startsWith('INVALID_') || code !== 'MOCK_GARMIN_CODE_123') {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid authorization code',
      });
    }

    // Purge single-use code
    authCodes.delete(code);
  }

  const accessToken = 'mock_garmin_access_token_999';
  const refreshToken = 'mock_garmin_refresh_token_888';
  const expiresIn = 86400;
  const user = {
    id: 'garmin_user_001',
    name: 'TestRunner_Pro',
  };

  activeSession = {
    connected: true,
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    user,
    scope: 'activity:read',
  };

  res.status(200).json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope: 'activity:read',
    user,
  });
}

router.post('/oauth/token', handleTokenExchange);
router.get('/oauth/token', handleTokenExchange);

// 3. Connection Status: GET /oauth/status
router.get('/oauth/status', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().includes('invalid')) {
    return res.status(401).json({
      connected: false,
      error: 'invalid_token',
      message: 'Access token is invalid',
    });
  }

  if (activeSession.connected) {
    return res.status(200).json({
      connected: true,
      token_type: 'Bearer',
      expires_in: Math.max(0, Math.round((activeSession.expiresAt - Date.now()) / 1000)),
      user: activeSession.user,
    });
  }

  res.status(200).json({
    connected: false,
    user: null,
  });
});

// 4. Disconnect: POST /oauth/disconnect & GET /oauth/disconnect
function handleDisconnect(req, res) {
  resetMockSession();
  res.status(200).json({
    connected: false,
    message: 'Garmin Connect session disconnected successfully',
  });
}

router.post('/oauth/disconnect', handleDisconnect);
router.get('/oauth/disconnect', handleDisconnect);

// 5. Callback handler: GET /oauth/callback
router.get('/oauth/callback', (req, res) => {
  const { code, state } = req.query;
  res.status(200).send(`
    <!DOCTYPE html>
    <html>
      <head><title>Garmin Connect Callback</title></head>
      <body>
        <p>Garmin authorization code received: <code>${code || ''}</code></p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'garmin:auth_code', code: '${code}', state: '${state}' }, '*');
            window.close();
          }
        </script>
      </body>
    </html>
  `);
});

// 6. Activities List: GET /activities
router.get('/activities', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && (authHeader.toLowerCase().includes('invalid') || authHeader.toLowerCase().includes('expired'))) {
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'The access token is invalid or expired',
    });
  }

  const limit = parseInt(req.query.limit, 10) || PRESEEDED_ACTIVITIES.length;
  const activities = PRESEEDED_ACTIVITIES.slice(0, limit);
  res.status(200).json(activities);
});

// 7. Activity Detail by ID: GET /activities/:id
router.get('/activities/:id', (req, res) => {
  const targetId = String(req.params.id);
  const found = PRESEEDED_ACTIVITIES.find(
    (act) => String(act.id) === targetId || String(act.activityId) === targetId
  );

  if (!found) {
    return res.status(404).json({
      error: 'Activity not found',
      activityId: req.params.id,
    });
  }

  res.status(200).json(found);
});

export default router;
