// Shared safety and fixture contracts; importing this file starts no services.
import assert from 'node:assert/strict';

export const SUPABASE_CLI_VERSION = '2.67.1';
export const fixtureOwner = '00000000-0000-4000-8000-00000000d001';
export const seedCounts = {
  users_settings: 1, courses: 4, assignments: 11, steps: 31,
  detected_items: 11, weekly_allocations: 4, estimate_events: 6,
  calibration_multipliers: 2, activity_log: 3, lms_connections: 0,
};

export function includeSnapshotPath(path) {
  const parts = path.split('/');
  return !parts.some((part) =>
    ['.git', '.jj', '.lovable', '.temp', '.branches', 'node_modules', 'dist', '.output'].includes(part)
    || (part === '.env' || part.startsWith('.env.')) && part !== '.env.example');
}

export function localStatus(status) {
  const url = new URL(status.API_URL);
  assert.equal(url.protocol, 'http:');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Only local Supabase is allowed');
  assert.equal(url.port, '54321');
  assert.ok(typeof status.ANON_KEY === 'string' && status.ANON_KEY.length > 0, 'Local anon key missing');
  return { url: url.origin, key: status.ANON_KEY };
}

export function assertSeedCounts(actual) {
  assert.deepEqual(actual, seedCounts, 'Fresh local seed counts differ from the committed fixture');
}