import { createFileRoute } from "@tanstack/react-router";
import { NextStepShell } from "@/components/nextstep-shell";
import { SettingsView } from "@/components/settings-view";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — NextStep" },
      { name: "description", content: "Manage your account, study capacity, planning preferences, calibration and Moodle connection." },
      { property: "og:title", content: "Settings — NextStep" },
      { property: "og:description", content: "Account, capacity, planning and connection settings in NextStep." },
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
      <SettingsView email={user.email ?? ""} />
    </NextStepShell>
  );
}
