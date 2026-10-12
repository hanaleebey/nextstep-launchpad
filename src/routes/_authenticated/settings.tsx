import { createFileRoute } from "@tanstack/react-router";
import { NextStepShell } from "@/components/nextstep-shell";
import { SettingsView } from "@/components/settings-view";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — NextStep" },
      { name: "description", content: "Set your weekly study hours, study window and timezone, and recompute this week's plan." },
      { property: "og:title", content: "Settings — NextStep" },
      { property: "og:description", content: "Weekly capacity and this week's allocation in NextStep." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();
  return (
    <NextStepShell email={user.email ?? ""}>
      <SettingsView />
    </NextStepShell>
  );
}
