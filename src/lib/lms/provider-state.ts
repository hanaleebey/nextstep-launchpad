// Browser-local demo preference; no Moodle credentials or course rows are stored here.
type ProviderState = { demo: boolean; cached: boolean };
const initial: ProviderState = { demo: false, cached: false };
let state = initial;
const listeners = new Set<() => void>();
let preferenceKey: string | null = null;

export const getProviderState = () => state;
export const getServerProviderState = () => initial;
export function subscribeProviderState(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function update(patch: Partial<ProviderState>) {
  const next = { ...state, ...patch };
  if (next.demo === state.demo && next.cached === state.cached) return;
  state = next;
  listeners.forEach((listener) => listener());
}
export function loadDemoPreference(account: string) {
  preferenceKey = `nextstep:demo:${account}`;
  let demo = false;
  try { demo = localStorage.getItem(preferenceKey) === "true"; } catch { /* Storage can be disabled. */ }
  update({ demo, cached: false });
}
export function setUseDemoData(demo: boolean) {
  if (preferenceKey) {
    try { localStorage.setItem(preferenceKey, String(demo)); } catch { /* Keep session preference. */ }
  }
  update({ demo });
}
export function setShowingCachedData(cached: boolean) { update({ cached }); }
export function clearProviderState() { preferenceKey = null; update(initial); }

// Fired after a background Moodle sync writes new rows, so views can refetch.
const dataListeners = new Set<() => void>();
export function subscribeLmsDataChanged(listener: () => void) {
  dataListeners.add(listener);
  return () => { dataListeners.delete(listener); };
}
export function notifyLmsDataChanged() { dataListeners.forEach((l) => l()); }