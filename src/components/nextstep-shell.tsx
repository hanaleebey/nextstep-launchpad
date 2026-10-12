import { Cable, Clock3, LogOut, Map, Play, Settings, UserRound } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlaceholderPanel } from "@/components/placeholder-panel";
import { supabase } from "@/integrations/supabase/client";

export function NextStepShell({ email }: { email: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <Tabs defaultValue="map" className="nextstep-shell">
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
        <TabsContent value="map"><div className="page-heading"><h1>Map</h1></div><PlaceholderPanel title="Map" icon={Map} /></TabsContent>
        <TabsContent value="execute"><div className="page-heading"><h1>Execute</h1></div><PlaceholderPanel title="Execute" icon={Play} /></TabsContent>
        <TabsContent value="behind"><div className="page-heading"><h1>Running behind</h1></div><PlaceholderPanel title="Running behind" icon={Clock3} /></TabsContent>
        <TabsContent value="connect"><div className="page-heading"><h1>Connect</h1></div><PlaceholderPanel title="Connect" icon={Cable} /></TabsContent>
        <TabsContent value="settings"><div className="page-heading"><h1>Settings</h1></div><PlaceholderPanel title="Settings" icon={Settings} /></TabsContent>
      </main>
    </Tabs>
  );
}