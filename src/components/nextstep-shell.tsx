import { Cable, Clock3, Map, Play, Settings, UserRound } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlaceholderPanel } from "@/components/placeholder-panel";

export function NextStepShell() {
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
          <div className="user-avatar" role="img" aria-label="User avatar"><UserRound size={17} strokeWidth={1.8} aria-hidden="true" /></div>
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