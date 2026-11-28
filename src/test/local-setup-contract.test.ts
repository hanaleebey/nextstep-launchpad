// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { includeSnapshotPath, localStatus, assertSeedCounts, seedCounts } from '../../scripts/local-setup-contract.mjs';

describe('Docker clean-clone safety contracts', () => {
  it('excludes actual environment files and local backend state but keeps examples and migration sources', () => {
    for (const path of ['.env', '.env.local', 'supabase/functions/.env', 'supabase/.temp/project-ref', 'node_modules/a.js', '.git/config']) {
      expect(includeSnapshotPath(path)).toBe(false);
    }
    for (const path of ['.env.example', 'supabase/functions/.env.example', 'supabase/migrations/test.sql', 'supabase/seed.sql']) {
      expect(includeSnapshotPath(path)).toBe(true);
    }
  });
  it('rejects hosted, encrypted or wrong-port endpoints before authenticated requests', () => {
    for (const url of ['https://example.supabase.co', 'https://localhost:54321', 'http://127.0.0.1:1234']) {
      expect(() => localStatus({ API_URL: url, ANON_KEY: 'fixture' })).toThrow();
    }
    expect(localStatus({ API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'fixture' }).url).toBe('http://127.0.0.1:54321');
  });
  it('requires exactly four courses, eleven assignments and 31 steps from the fresh seed', () => {
    expect(() => assertSeedCounts(seedCounts)).not.toThrow();
    expect(() => assertSeedCounts({ ...seedCounts, courses: 3 })).toThrow();
    expect(() => assertSeedCounts({ ...seedCounts, assignments: 10 })).toThrow();
    expect(() => assertSeedCounts({ ...seedCounts, steps: 30 })).toThrow();
  });
});