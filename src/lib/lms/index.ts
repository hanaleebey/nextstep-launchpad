// Single entry point for LMS data. Components call getLmsProvider() and never
// talk to Moodle/Canvas (or fetch) directly. Swap the implementation here.
import { getLmsConnection } from "@/lib/db";
import { MoodleProvider } from "./moodleProvider";
import { MockProvider } from "./mockProvider";
import { clearProviderState, getProviderState } from "./provider-state";
import type { LmsProvider } from "./types";

export type * from "./types";

let provider: LmsProvider | null = null;
let connectionKey: string | null | undefined;
let resolving: Promise<LmsProvider> | null = null;
const mock = new MockProvider();

/** The shell supplies its shared connection query; undefined means not loaded yet. */
export function configureLmsConnection(connection: { id?: string; site_url?: string | null } | null): boolean {
  const key = connection ? `${connection.id ?? ""}:${connection.site_url ?? ""}` : null;
  if (key === connectionKey) return false;
  if (provider instanceof MoodleProvider) provider.dispose();
  connectionKey = key;
  provider = connection ? new MoodleProvider() : mock;
  return true;
}

export function resetLmsProvider() {
  if (provider instanceof MoodleProvider) provider.dispose();
  provider = null; connectionKey = undefined; resolving = null;
  clearProviderState();
}

async function resolveProvider(): Promise<LmsProvider> {
  if (getProviderState().demo) return mock;
  if (provider) return provider;
  if (!resolving) resolving = getLmsConnection().then((connection) => {
    configureLmsConnection(connection);
    return provider ?? mock;
  }).finally(() => { resolving = null; });
  return resolving;
}

// Preserve the synchronous factory contract while the first connection read resolves.
const pendingProvider: LmsProvider = {
  validateConnection: (siteUrl, token) => new MoodleProvider().validateConnection(siteUrl, token),
  getCourses: async () => (await resolveProvider()).getCourses(),
  getAssignments: async (courseId) => (await resolveProvider()).getAssignments(courseId),
  getCourseContents: async (courseId) => (await resolveProvider()).getCourseContents(courseId),
};

export function getLmsProvider(): LmsProvider {
  return getProviderState().demo ? mock : provider ?? pendingProvider;
}

/** Force a Moodle sync now. Returns false when no live Moodle connection is active. */
export async function syncLmsNow(): Promise<boolean> {
  const p = await resolveProvider();
  if (!(p instanceof MoodleProvider)) return false;
  await p.syncNow();
  return true;
}

export { subscribeLmsDataChanged } from "./provider-state";
