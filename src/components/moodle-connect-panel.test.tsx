import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoodleConnectPanel } from "./moodle-connect-panel";
import { NextStepShell } from "./nextstep-shell";
import { resetLmsProvider } from "@/lib/lms";
import { setShowingCachedData } from "@/lib/lms/provider-state";
import { act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), connection: vi.fn(), navigate: vi.fn(), sync: vi.fn(), process: vi.fn(), prepare: vi.fn(), edit: vi.fn(), confirm: vi.fn(), settings: vi.fn(), detected: vi.fn() }));
vi.mock("@/lib/lms/moodle-connect", () => ({ connectMoodle: mocks.connect }));
vi.mock("@/lib/db", () => ({ getLmsConnection: mocks.connection, getSettings: mocks.settings, listDetectedItems: mocks.detected }));
vi.mock("@/lib/lms/moodle-sync", () => ({ syncMoodle: mocks.sync }));
vi.mock("@/lib/lms/process-sync", () => ({ processMoodleSync: mocks.process }));
vi.mock("@/lib/agent/connect-plan", () => ({ prepareConnectPlan: mocks.prepare, editDetectedEstimate: mocks.edit, confirmConnectPlan: mocks.confirm }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("@/components/ai-plan-panel", () => ({ AiPlanPanel: () => null }));
vi.mock("@/components/map-view", () => ({ MapView: () => <h1>Semester map</h1> }));
vi.mock("@/components/execute-view", () => ({ ExecuteView: () => null }));
vi.mock("@/components/behind-view", () => ({ BehindView: () => null }));

function mount(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
function fill() {
  fireEvent.change(screen.getByLabelText("Moodle site URL"), { target: { value: "https://moodle.example.edu" } });
  fireEvent.change(screen.getByLabelText("Web services token"), { target: { value: "test-only-token" } });
}
beforeEach(() => {
  vi.clearAllMocks(); resetLmsProvider(); localStorage.clear(); mocks.connection.mockResolvedValue(null);
  mocks.settings.mockResolvedValue({ timezone: "UTC" });
  mocks.detected.mockResolvedValue([]);
  mocks.sync.mockImplementation(() => new Promise(() => {}));
});
afterEach(cleanup);

describe("Moodle onboarding", () => {
  it("masks and toggles the token, then clears it before success advances step 2", async () => {
    mocks.connect.mockResolvedValue({ ok: true, siteName: "Test Moodle", username: "Student", userId: "1" });
    mount(<MoodleConnectPanel />);
    fill();
    expect(screen.getByLabelText("Web services token")).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show token" }));
    expect(screen.getByLabelText("Web services token")).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Connect to Moodle" }));
    expect(screen.getByLabelText("Web services token")).toHaveValue("");
    expect(screen.getByLabelText("Web services token")).toHaveAttribute("type", "password");
    await screen.findByText("Connected to Test Moodle as Student.");
    expect(screen.getByText("Auto-detect work").closest("li")).toHaveAttribute("aria-current", "step");
    expect(mocks.connect).toHaveBeenCalledWith("https://moodle.example.edu", "test-only-token");
  });

  it("shows specific failures inline without echoing the token and permits retry", async () => {
    mocks.connect.mockResolvedValue({ ok: false, code: "INVALID_TOKEN", message: "Moodle rejected test-only-token. Check it and try again." });
    mount(<MoodleConnectPanel />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Connect to Moodle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Moodle rejected [redacted]. Check it and try again.");
    expect(screen.getByLabelText("Web services token")).toHaveValue("");
    expect(screen.getByText("Connect your LMS", { selector: ".connect-step-label" }).closest("li")).toHaveAttribute("aria-current", "step");
    fill();
    expect(screen.getByRole("button", { name: "Connect to Moodle" })).toBeEnabled();
  });

  it("handles an unreachable service inline", async () => {
    mocks.connect.mockRejectedValue(new Error("private transport detail"));
    mount(<MoodleConnectPanel />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Connect to Moodle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the connection service.");
  });

  it("automatically detects, prepares, edits, and confirms into Map", async () => {
    const item = { id: "d1", assignment_id: "a1", title: "Memory lecture", item_type: "video", signal_value: "18:32 length", estimated_minutes: 19, estimated_is_manual: false, confidence: "medium" };
    mocks.connect.mockResolvedValue({ ok: true, siteName: "Test Moodle", username: "Student" });
    mocks.sync.mockResolvedValue({ ok: true, partial: false, summary: { courses: 1, assignments: 1, items: 1 }, items: [], warnings: [] });
    mocks.process.mockResolvedValue([item]);
    mocks.prepare.mockResolvedValue({ assignments: 1, steps: 4, firstDeadline: "2026-10-18T18:00:00Z", redTitles: [] });
    mocks.edit.mockResolvedValue({ ...item, estimated_minutes: 45, estimated_is_manual: true });
    mocks.confirm.mockResolvedValue(undefined);
    mount(<NextStepShell email="student@example.edu" initialTab="connect" />);
    fill(); fireEvent.click(screen.getByRole("button", { name: "Connect to Moodle" }));
    await screen.findByText("18:32 length");
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Confirm plan", { selector: ".connect-step-label" }).closest("li")).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: "Edit estimated time for Memory lecture" }));
    fireEvent.change(screen.getByLabelText("Estimated minutes for Memory lecture"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Save estimate" }));
    await screen.findByText("manual");
    expect(screen.getByText("Total this week: est. 0h 45m")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Build my plan" }));
    await screen.findByRole("heading", { name: "Semester map" });
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the connection and retries a failed detection without asking for details", async () => {
    mocks.connection.mockResolvedValue({ site_url: "https://moodle.example.edu" });
    mocks.sync.mockRejectedValueOnce(new Error("Moodle sync could not finish."));
    mocks.sync.mockResolvedValueOnce({ ok: true, partial: false, warnings: [], items: [], summary: { courses: 0, assignments: 0, items: 0 } });
    mocks.process.mockResolvedValue([]);
    mocks.prepare.mockResolvedValue({ assignments: 0, steps: 0, firstDeadline: null, redTitles: [] });
    mount(<MoodleConnectPanel />);
    await screen.findByText("Moodle sync could not finish.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("No work due this week was found.");
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("opens Get started on first run and from the connection pill", async () => {
    mount(<NextStepShell email="student@example.edu" />);
    await screen.findByRole("heading", { name: "Get started" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Map" }), { button: 0, ctrlKey: false });
    await screen.findByRole("heading", { name: "Semester map" });
    fireEvent.click(screen.getByRole("button", { name: "Open LMS connection" }));
    await screen.findByRole("heading", { name: "Get started" });
  });

  it("preserves an explicit tab and opens Connect from settings", async () => {
    mount(<NextStepShell email="student@example.edu" initialTab="map" />);
    await screen.findByRole("heading", { name: "Semester map" });
    cleanup();
    mount(<NextStepShell email="student@example.edu"><h1>Settings</h1></NextStepShell>);
    fireEvent.click(screen.getByRole("button", { name: "Open LMS connection" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/", search: { tab: "connect" } }));
  });

  it("opens demo Map without Moodle and returns to the saved source when disabled", async () => {
    mount(<NextStepShell email="student@example.edu" />);
    await screen.findByRole("heading", { name: "Get started" });
    fireEvent.click(screen.getByRole("switch", { name: "Use demo data" }));
    await screen.findByRole("heading", { name: "Semester map" });
    expect(screen.getByRole("switch", { name: "Use demo data" })).toBeChecked();
    expect(screen.getByText("Demo data", { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Use demo data" }));
    expect(screen.getByRole("switch", { name: "Use demo data" })).not.toBeChecked();
    expect(screen.queryByText("Demo data", { exact: true })).not.toBeInTheDocument();
    expect(mocks.connect).not.toHaveBeenCalled();
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
});