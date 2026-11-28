export const SUPABASE_CLI_VERSION: string;
export const fixtureOwner: string;
export const seedCounts: Record<string, number>;
export function includeSnapshotPath(path: string): boolean;
export function localStatus(status: { API_URL: string; ANON_KEY: string }): { url: string; key: string };
export function assertSeedCounts(actual: Record<string, number>): void;