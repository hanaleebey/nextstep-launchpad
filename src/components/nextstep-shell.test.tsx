// Shell behaviour only: source switching, first-run tab choice, and the
// cached-data notice. Views are stubbed so the shell is tested on its own.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextStepShell } from "./nextstep-shell";
import { resetLmsProvider } from "@/lib/lms";
import { setShowingCachedData } from "@/lib/lms/provider-state";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), navigate: vi.fn() }));
vi.mock("@/lib/db", () => ({ getLmsConnection: mocks.connection }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("@/components/map-view", () => ({ MapView: () => <h1>Semester map</h1> }));
vi.mock("@/components/execute-view", () => ({ ExecuteView: () => null }));
vi.mock("@/components/behind-view", () => ({ BehindView: () => null }));

function mount(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLmsProvider();
  localStorage.clear();
  mocks.connection.mockResolvedValue(null);
});
afterEach(cleanup);

describe("NextStepShell", () => {
  it("opens Connect on first run and Map once a connection is saved", async () => {
    mount(<NextStepShell email="student@example.edu" />);
    await screen.findByRole("heading", { name: "Connect" });
    cleanup();
    mocks.connection.mockResolvedValue({ site_url: "https://moodle.example.edu" });
    mount(<NextStepShell email="student@example.edu" />);
    await screen.findByRole("heading", { name: "Semester map" });
  });

  it("keeps an explicitly requested tab over the first-run default", async () => {
    mount(<NextStepShell email="student@example.edu" initialTab="map" />);
    await screen.findByRole("heading", { name: "Semester map" });
  });

  it("switches to demo Map and back to the saved source", async () => {
    mount(<NextStepShell email="student@example.edu" />);
    await screen.findByRole("heading", { name: /connect/i });
    fireEvent.click(screen.getByRole("switch", { name: "Use demo data" }));
    await screen.findByRole("heading", { name: "Semester map" });
    expect(screen.getByRole("switch", { name: "Use demo data" })).toBeChecked();
    expect(screen.getByText("Demo data", { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Use demo data" }));
    expect(screen.getByRole("switch", { name: "Use demo data" })).not.toBeChecked();
    expect(screen.queryByText("Demo data", { exact: true })).not.toBeInTheDocument();
  });

  it("shows a non-blocking cached notice and hides it in demo mode", async () => {
    mocks.connection.mockResolvedValue({ id: "c1", site_url: "https://moodle.example.edu" });
    mount(<NextStepShell email="student@example.edu" initialTab="map" />);
    await screen.findByRole("heading", { name: "Semester map" });
    act(() => setShowingCachedData(true));
    expect(screen.getByRole("status")).toHaveTextContent("Showing cached data");
    expect(screen.getByRole("heading", { name: "Semester map" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Use demo data" }));
    expect(screen.queryByText("Showing cached data")).not.toBeInTheDocument();
  });

  it("opens Connect from the connection pill while on a standalone page", async () => {
    mount(
      <NextStepShell email="student@example.edu">
        <h1>Settings</h1>
      </NextStepShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open LMS connection" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/", search: { tab: "connect" } }));
  });
});
