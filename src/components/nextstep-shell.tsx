import { Cable, Clock3, LogOut, Map, Play, Settings, UserRound } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlaceholderPanel } from "@/components/placeholder-panel";
import { MapView } from "@/components/map-view";
import { ExecuteView } from "@/components/execute-view";
import { BehindView } from "@/components/behind-view";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

// The shell hosts the tab views on "/" and, when `children` is given, a
// standalone page (e.g. /settings) in the same frame. Settings is a real route,
// so its nav item navigates instead of switching a tab.
export function NextStepShell({ email, initialTab = "map", children }: { email: string; initialTab?: string | undefined; children?: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(children ? "settings" : initialTab ?? "map");
  function changeTab(value: string) {
    if (value === "settings") navigate({ to: "/settings" });
    else if (children) navigate({ to: "/", search: { tab: value } });
    else setTab(value);
  }
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <Tabs value={tab} onValueChange={changeTab} className="nextstep-shell">
      <header className="shell-topbar">
        <div className="shell-brand" aria-label="NextStep — Executive-function coach">
          <div className="brand-logo" aria-hidden="true">N</div>
          <div><div className="brand-name">NextStep</div><div className="brand-subtitle">Executive-function coach</div></div>
        </div>
        <TabsList aria-label="Main navigation" className="shell-navigation">
          <TabsTrigger value="map"><Map aria-hidden="true" />Map</TabsTrigger>
          <TabsTrigger value="execute"><Play aria-hidden="true" />Execute</TabsTrigger>
          <TabsTrigger value="behind"><Clock3 aria-hidden="true" />Running behind</TabsTrigger>
          <TabsTrigger value="connect"><Cable aria-hidden="true" />Connect</TabsTrigger>
          <TabsTrigger value="settings"><Settings aria-hidden="true" />Settings</TabsTrigger>
        </TabsList>
        <div className="shell-account">
          <span className="connection-status"><span className="status-dot" aria-hidden="true" />Not connected</span>
          <span className="text-sm text-muted-foreground" title={email}>{email}</span>
          <div className="user-avatar" role="img" aria-label={`Signed in as ${email}`}><UserRound size={17} strokeWidth={1.8} aria-hidden="true" /></div>
          <button type="button" onClick={signOut} aria-label="Sign out" className="rounded-full p-2 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><LogOut size={17} aria-hidden="true" /></button>
        </div>
      </header>
      <main className="shell-container">
        {children ?? (<>
        <TabsContent value="map"><MapView onOpen={() => setTab("execute")} /></TabsContent>
        <TabsContent value="execute"><ExecuteView /></TabsContent>
        <TabsContent value="behind"><BehindView /></TabsContent>
        <TabsContent value="connect"><div className="page-heading"><h1>Connect</h1></div><PlaceholderPanel title="Connect" icon={Cable} /></TabsContent>
                </>)}
      </main>
    </Tabs>
  );
}