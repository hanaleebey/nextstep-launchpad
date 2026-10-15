// Single entry point for LMS data. Components call getLmsProvider() and never
// talk to Moodle/Canvas (or fetch) directly. Swap the implementation here.
import { CachedProvider } from "./cachedProvider";
import type { LmsProvider } from "./types";

export type * from "./types";

let provider: LmsProvider | null = null;

export function getLmsProvider(): LmsProvider {
  if (!provider) provider = new CachedProvider();
  return provider;
}
