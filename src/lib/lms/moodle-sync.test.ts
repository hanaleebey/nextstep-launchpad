import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncMoodle } from "./moodle-sync";
import { clearProviderState, getProviderState } from "./provider-state";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
beforeEach(() => { vi.clearAllMocks(); clearProviderState(); });
describe("sync transport", () => {
  it("uses the Edge Function and handles a partial reply", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, partial: true, summary: { courses: 1, assignments: 2, items: 2 }, items: [], warnings: [] }, error: null });
    expect((await syncMoodle()).partial).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith("moodle-sync", expect.objectContaining({ body: {}, signal: expect.any(AbortSignal) }));
    expect(getProviderState().cached).toBe(true);
  });
  it("returns a safe error on unexpected responses", async () => {
    mocks.invoke.mockResolvedValue({ data: {}, error: null });
    await expect(syncMoodle()).rejects.toThrow("previously saved work is unchanged");
    expect(getProviderState().cached).toBe(true);
  });
  it("aborts a stalled request at twelve seconds", async () => {
    vi.useFakeTimers();
    try {
      mocks.invoke.mockImplementation((_name, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }));
      const assertion = expect(syncMoodle()).rejects.toThrow("previously saved work is unchanged");
      await vi.advanceTimersByTimeAsync(12_000);
      await assertion;
      expect(getProviderState().cached).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});