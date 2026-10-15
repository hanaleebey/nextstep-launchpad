import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoodleConnectPanel } from "./moodle-connect-panel";
import { NextStepShell } from "./nextstep-shell";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), connection: vi.fn(), navigate: vi.fn() }));
vi.mock("@/lib/lms/moodle-connect", () => ({ connectMoodle: mocks.connect }));
vi.mock("@/lib/db", () => ({ getLmsConnection: mocks.connection }));
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
beforeEach(() => { vi.clearAllMocks(); mocks.connection.mockResolvedValue(null); });
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
});