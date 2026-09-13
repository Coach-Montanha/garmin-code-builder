import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import garminRoutes, {
  verifyPkce,
  resetMockSession,
  PRESEEDED_ACTIVITIES
} from '../../server/routes/garminRoutes.js';

describe('Garmin Server Routes & PKCE OAuth (Milestone 2)', () => {
  let app;
  let server;
  let baseUrl;

  beforeEach(async () => {
    resetMockSession();
    app = express();
    app.use(express.json());
    app.use('/api/garmin', garminRoutes);

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api/garmin`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = null;
    }
  });

  describe('verifyPkce cryptographic helper', () => {
    it('verifies valid SHA-256 base64url PKCE verifier and challenge', () => {
      const verifier = 'high_entropy_random_string_verifier_1234567890';
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

      assert.equal(verifyPkce(verifier, challenge, 'S256'), true);
    });

    it('rejects mismatched verifier', () => {
      const verifier = 'correct_verifier_string_abcdef';
      const wrongVerifier = 'wrong_verifier_string_123456';
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

      assert.equal(verifyPkce(wrongVerifier, challenge, 'S256'), false);
    });

    it('handles plain challenge method', () => {
      assert.equal(verifyPkce('plain_token_123', 'plain_token_123', 'plain'), true);
      assert.equal(verifyPkce('plain_token_123', 'other_token_456', 'plain'), false);
    });
  });

  describe('OAuth Endpoints', () => {
    it('GET /oauth/authorize registers code and challenge and returns authUrl', async () => {
      const verifier = 'my_secret_code_verifier_9999999999999';
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

      const res = await fetch(`${baseUrl}/oauth/authorize?client_id=my_client&code_challenge=${challenge}&code_challenge_method=S256&state=xyz123`);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.ok(data.code);
      assert.equal(data.clientId, 'my_client');
      assert.equal(data.state, 'xyz123');
      assert.ok(data.authUrl.includes(data.code));
    });

    it('POST /oauth/token exchanges authorization code and verifies PKCE', async () => {
      const verifier = 'pkce_verifier_secret_testing_43_chars_long!!';
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

      const authRes = await fetch(`${baseUrl}/oauth/authorize?code_challenge=${challenge}`);
      const authData = await authRes.json();

      const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: authData.code,
          code_verifier: verifier,
        }),
      });

      assert.equal(tokenRes.status, 200);
      const tokenData = await tokenRes.json();
      assert.ok(tokenData.access_token);
      assert.equal(tokenData.token_type, 'Bearer');
      assert.ok(tokenData.user);
      assert.equal(tokenData.user.name, 'TestRunner_Pro');

      // Status endpoint now reflects connected user
      const statusRes = await fetch(`${baseUrl}/oauth/status`);
      const statusData = await statusRes.json();
      assert.equal(statusData.connected, true);
      assert.equal(statusData.user.name, 'TestRunner_Pro');
    });

    it('POST /oauth/token rejects invalid PKCE verifier with 400', async () => {
      const verifier = 'correct_verifier_string_12345';
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

      const authRes = await fetch(`${baseUrl}/oauth/authorize?code_challenge=${challenge}`);
      const authData = await authRes.json();

      const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: authData.code,
          code_verifier: 'tampered_verifier',
        }),
      });

      assert.equal(tokenRes.status, 400);
      const err = await tokenRes.json();
      assert.equal(err.error, 'invalid_grant');
      assert.match(err.error_description, /PKCE verification failed/);
    });

    it('POST /oauth/disconnect clears session', async () => {
      // Authorize first
      await fetch(`${baseUrl}/oauth/authorize`);
      await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'MOCK_GARMIN_CODE_123' }),
      });

      const discRes = await fetch(`${baseUrl}/oauth/disconnect`, { method: 'POST' });
      assert.equal(discRes.status, 200);
      const discData = await discRes.json();
      assert.equal(discData.connected, false);

      const statusRes = await fetch(`${baseUrl}/oauth/status`);
      const statusData = await statusRes.json();
      assert.equal(statusData.connected, false);
    });
  });

  describe('Activities Endpoints', () => {
    it('GET /activities returns all pre-seeded activities including 5K, 10K, Half-Marathon, Treadmill', async () => {
      const res = await fetch(`${baseUrl}/activities`);
      assert.equal(res.status, 200);

      const activities = await res.json();
      assert.ok(Array.isArray(activities));
      assert.ok(activities.length >= 4);

      const names = activities.map((a) => a.name);
      assert.ok(names.some((n) => n.includes('5K')));
      assert.ok(names.some((n) => n.includes('10K')));
      assert.ok(names.some((n) => n.includes('Half Marathon')));
      assert.ok(names.some((n) => n.includes('Treadmill')));
    });

    it('GET /activities/:id returns detailed activity with telemetry', async () => {
      const res = await fetch(`${baseUrl}/activities/garmin_act_5k`);
      assert.equal(res.status, 200);

      const act = await res.json();
      assert.equal(act.id, 'garmin_act_5k');
      assert.equal(act.totalDistanceKm, 5.12);
      assert.equal(act.elapsedTimeSec, 1560);
      assert.equal(act.averagePaceMinPerKm, '4:59');
      assert.ok(Array.isArray(act.trackPoints));
      assert.equal(act.trackPoints.length, 5);
    });

    it('GET /activities/:id returns indoor treadmill activity with 0 trackpoints safely', async () => {
      const res = await fetch(`${baseUrl}/activities/indoor_treadmill_run`);
      assert.equal(res.status, 200);

      const act = await res.json();
      assert.equal(act.id, 'indoor_treadmill_run');
      assert.equal(act.totalDistanceKm, 5.0);
      assert.equal(act.elapsedTimeSec, 1500);
      assert.equal(act.averagePaceMinPerKm, '5:00');
      assert.deepEqual(act.trackPoints, []);
    });

    it('GET /activities/:id returns 404 for unknown activity id', async () => {
      const res = await fetch(`${baseUrl}/activities/unknown_run_999`);
      assert.equal(res.status, 404);

      const data = await res.json();
      assert.equal(data.error, 'Activity not found');
    });
  });
});
