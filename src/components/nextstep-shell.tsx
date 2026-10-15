import { Cable, CheckCircle2, CloudOff, Clock3, LogOut, Map, Play, Settings, UserRound } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getLmsConnection } from "@/lib/db";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MoodleConnectPanel } from "@/components/moodle-connect-panel";
import { MapView } from "@/components/map-view";
import { ExecuteView } from "@/components/execute-view";
import { BehindView } from "@/components/behind-view";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { configureLmsConnection, resetLmsProvider } from "@/lib/lms";
import { getProviderState, getServerProviderState, loadDemoPreference, setUseDemoData, subscribeProviderState } from "@/lib/lms/provider-state";

// The shell hosts the tab views on "/" and, when `children` is given, a
// standalone page (e.g. /settings) in the same frame. Settings is a real route,
// so its nav item navigates instead of switching a tab.
export function NextStepShell({ email, initialTab, children }: { email: string; initialTab?: string | undefined; children?: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const connection = useQuery({ queryKey: ["lms-connection"], queryFn: getLmsConnection });
  const providerState = useSyncExternalStore(subscribeProviderState, getProviderState, getServerProviderState);
  useEffect(() => { loadDemoPreference(email); }, [email]);
  useEffect(() => {
    if (connection.data !== undefined && configureLmsConnection(connection.data)) {
      void queryClient.invalidateQueries({ queryKey: ["lms"] });
    }
  }, [connection.data, queryClient]);
  function toggleDemo(demo: boolean) {
    setUseDemoData(demo);
    // Remove the previous source before mounting the next one: never show real
    // assignments under the demo label (or vice versa).
    void queryClient.cancelQueries({ queryKey: ["lms"] });
    queryClient.removeQueries({ queryKey: ["lms"] });
    if (!children) setTab("map");
  }
  const [selectedTab, setTab] = useState<string | undefined>(children ? "settings" : initialTab);
  // A saved connection is the first-run marker. Explicit tab choices always win.
  const tab = selectedTab ?? (!providerState.demo && connection.data === null ? "connect" : "map");
  function changeTab(value: string) {
    if (value === "settings") navigate({ to: "/settings" });
    else if (children) navigate({ to: "/", search: { tab: value } });
    else setTab(value);
  }
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    resetLmsProvider();
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
          <Button type="button" variant="ghost" onClick={() => changeTab("connect")} className={`connection-status ${connection.data?.site_url ? "is-connected" : ""}`} aria-label="Open LMS connection">
            {connection.data?.site_url ? <CheckCircle2 aria-hidden="true" /> : <Cable aria-hidden="true" />}
            {connection.isPending ? "Checking…" : connection.data?.site_url ? "Connected" : "Not connected"}
          </Button>
          <span className="shell-email text-sm text-muted-foreground" title={email}>{email}</span>
          <div className="user-avatar" role="img" aria-label={`Signed in as ${email}`}><UserRound size={17} strokeWidth={1.8} aria-hidden="true" /></div>
          <Button type="button" variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" title="Sign out" className="rounded-full text-muted-foreground"><LogOut size={17} aria-hidden="true" /></Button>
        </div>
      </header>
      <main className="shell-container">
        <div className="lms-source-bar">
          <label className="demo-data-control" htmlFor="use-demo-data">
            <Switch id="use-demo-data" checked={providerState.demo} onCheckedChange={toggleDemo} />
            Use demo data
          </label>
          {providerState.demo ? <span className="text-sm text-muted-foreground" role="status">Demo data</span> : providerState.cached && <span className="cached-data-notice" role="status"><CloudOff size={16} aria-hidden="true" />Showing cached data</span>}
        </div>
        {children ?? (connection.isPending && !selectedTab ? <p className="page-heading text-muted-foreground" role="status">Loading your connection…</p> : <>
        <TabsContent value="map"><MapView onOpen={() => setTab("execute")} /></TabsContent>
        <TabsContent value="execute"><ExecuteView /></TabsContent>
        <TabsContent value="behind"><BehindView /></TabsContent>
        <TabsContent value="connect"><MoodleConnectPanel onComplete={() => setTab("map")} /></TabsContent>
                </>)}
      </main>
    </Tabs>
  );
}