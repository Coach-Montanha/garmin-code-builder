import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseGpxXml,
  parseGarminActivityJson,
  validateXmlStructure
} from '../../public/js/services/garminService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.resolve(__dirname, '../fixtures');

describe('Garmin Telemetry Parsers (GPX 1.1 & Garmin JSON)', () => {

  describe('validateXmlStructure pure-JS validator', () => {
    it('validates well-formed GPX XML', () => {
      const gpxText = fs.readFileSync(path.join(FIXTURE_DIR, 'sample_5k.gpx'), 'utf8');
      assert.equal(validateXmlStructure(gpxText), true);
    });

    it('rejects corrupt/truncated XML without closing tags', () => {
      const corruptGpx = fs.readFileSync(path.join(FIXTURE_DIR, 'corrupt.gpx'), 'utf8');
      assert.equal(validateXmlStructure(corruptGpx), false);
    });

    it('rejects non-XML or missing GPX root', () => {
      assert.equal(validateXmlStructure('<xml><data>Test</data></xml>'), false);
      assert.equal(validateXmlStructure('Not an XML string'), false);
      assert.equal(validateXmlStructure(''), false);
    });
  });

  describe('parseGpxXml - Standard GPX 1.1 Import', () => {
    it('successfully parses sample_5k.gpx with trackpoints and telemetry', () => {
      const gpxText = fs.readFileSync(path.join(FIXTURE_DIR, 'sample_5k.gpx'), 'utf8');
      const act = parseGpxXml(gpxText);

      assert.equal(act.name, 'Morning 5K Road Run');
      assert.ok(act.totalDistanceKm > 0);
      assert.equal(act.elapsedTimeSec, 930); // 09:45:00 to 10:00:30 = 15m30s = 930s
      assert.equal(act.trackPoints.length, 5);
      assert.equal(act.trackPoints[0].lat, -23.5874);
      assert.equal(act.trackPoints[0].lng, -46.6576);
      assert.equal(act.trackPoints[0].elevation, 760.0);
      assert.equal(act.trackPoints[0].heartRate, 142);
      assert.equal(act.trackPoints[0].cadence, 84);
      assert.match(act.averagePaceMinPerKm, /^\d+:\d{2}$/);
    });

    it('rejects corrupt/truncated GPX with descriptive error (T2.04)', () => {
      const corruptGpx = fs.readFileSync(path.join(FIXTURE_DIR, 'corrupt.gpx'), 'utf8');
      assert.throws(
        () => parseGpxXml(corruptGpx),
        /Invalid GPX XML format/i
      );
    });

    it('rejects GPX with zero trackpoints with descriptive error (T2.05)', () => {
      const noTrkptGpx = fs.readFileSync(path.join(FIXTURE_DIR, 'no_trkpt.gpx'), 'utf8');
      assert.throws(
        () => parseGpxXml(noTrkptGpx),
        /No trackpoints found in GPX file/i
      );
    });

    it('rejects empty string payload', () => {
      assert.throws(
        () => parseGpxXml(''),
        /Invalid GPX XML format/i
      );
    });
  });

  describe('parseGarminActivityJson - Activity JSON Import', () => {
    it('successfully parses sample_activity.json export format', () => {
      const jsonText = fs.readFileSync(path.join(FIXTURE_DIR, 'sample_activity.json'), 'utf8');
      const act = parseGarminActivityJson(jsonText);

      assert.equal(act.name, 'Morning 5K Park Run');
      assert.equal(act.totalDistanceKm, 5.12);
      assert.equal(act.elapsedTimeSec, 1560);
      assert.equal(act.averagePaceMinPerKm, '4:59');
      assert.equal(act.trackPoints.length, 5);
      assert.equal(act.trackPoints[0].lat, -23.5874);
      assert.equal(act.trackPoints[0].lng, -46.6576);
      assert.equal(act.trackPoints[0].elevation, 760.0);
    });

    it('rejects corrupt activity JSON missing mandatory fields (T2.06)', () => {
      const corruptJson = fs.readFileSync(path.join(FIXTURE_DIR, 'corrupt_activity.json'), 'utf8');
      assert.throws(
        () => parseGarminActivityJson(corruptJson),
        /Invalid activity JSON: missing mandatory fields/i
      );
    });

    it('safely handles indoor treadmill activity with 0 GPS points (T2.07)', () => {
      const treadmillPayload = {
        id: 'indoor_treadmill_run',
        name: 'Indoor Treadmill 5K',
        startTime: '2026-09-12T07:00:00Z',
        totalDistanceKm: 5.0,
        elapsedTimeSec: 1500,
        averagePaceMinPerKm: '5:00',
        trackPoints: []
      };

      const act = parseGarminActivityJson(treadmillPayload);
      assert.equal(act.name, 'Indoor Treadmill 5K');
      assert.equal(act.totalDistanceKm, 5.0);
      assert.equal(act.elapsedTimeSec, 1500);
      assert.equal(act.averagePaceMinPerKm, '5:00');
      assert.deepEqual(act.trackPoints, []);
    });
  });
});
