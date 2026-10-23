import { useState, useEffect } from "react";
import type { User, McpServer, McpTool, ApiKey } from "./types";
import {
  getStoredToken,
  clearStoredToken,
  getMe,
  getServers,
  getKeys,
} from "./services/api";
import { LoginScreen } from "./components/LoginScreen";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ServersView } from "./components/ServersView";
import { StoresView } from "./components/StoresView";
import { ApiKeysView } from "./components/ApiKeysView";
import { AuditView } from "./components/AuditView";
import { ChatAgent } from "./components/ChatAgent";
import { ObservabilityView } from "./components/ObservabilityView";
import { PermissionsView } from "./components/PermissionsView";

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [activeTab, setActiveTab] = useState<"servers" | "stores" | "observability" | "permissions" | "keys" | "audit" | "chat">("servers");
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Check existing session
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }

    getMe()
      .then((user) => {
        setCurrentUser(user);
      })
      .catch(() => {
        clearStoredToken();
        setCurrentUser(null);
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  const loadData = async (forcePing = false) => {
    if (!currentUser) return;
    setIsRefreshing(true);
    try {
      const [serversData, keysData] = await Promise.all([
        getServers(forcePing).catch(() => ({ servers: [], tools: [] })),
        getKeys().catch(() => []),
      ]);
      setServers(serversData.servers || []);
      setTools(serversData.tools || []);
      setKeys(keysData || []);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleGlobalRefresh = async () => {
    setIsRefreshing(true);
    setRefreshTrigger(Date.now());
    try {
      await loadData(true);
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser]);

  const handleLogout = () => {
    clearStoredToken();
    setCurrentUser(null);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-mono text-xs text-[#666666]">
        Connecting to MCPilot Gateway...
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  const tabTitles: Record<string, string> = {
    servers: "Upstream MCP Servers & Aggregated Catalog",
    stores: "Multi-Store Environments & Automated Provisioning",
    observability: "Real-time Observability, Latency Quantiles & Failure Diagnostics",
    permissions: "Tool Permissions, Visibility Filtering & Policy Engine",
    keys: "Team Access Control & API Key Lifecycle",
    audit: "Granular Audit Trail & Trace Inspector",
    chat: "Interactive Chat Agent & Federated Tool Invocation",
  };

  return (
    <div className="min-h-screen bg-black text-[#EDEDED] flex">
      {/* 260px Fixed Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className="flex-1 pl-64 flex flex-col min-h-screen">
        <Header
          activeTitle={tabTitles[activeTab] || "Gateway Dashboard"}
          onRefresh={handleGlobalRefresh}
          isRefreshing={isRefreshing}
        />

        <main className="flex-1 p-6 md:p-8 bg-black">
          {activeTab === "servers" && (
            <ServersView
              servers={servers}
              tools={tools}
              currentUser={currentUser}
              onRefresh={handleGlobalRefresh}
              isRefreshing={isRefreshing}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeTab === "stores" && (
            <StoresView
              currentUser={currentUser}
              refreshTrigger={refreshTrigger}
              onRefresh={handleGlobalRefresh}
            />
          )}

          {activeTab === "observability" && (
            <ObservabilityView
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeTab === "permissions" && (
            <PermissionsView
              currentUser={currentUser}
              refreshTrigger={refreshTrigger}
              onRefresh={handleGlobalRefresh}
            />
          )}

          {activeTab === "keys" && (
            <ApiKeysView
              keys={keys}
              currentUser={currentUser}
              onRefresh={handleGlobalRefresh}
              isRefreshing={isRefreshing}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeTab === "audit" && (
            <AuditView
              refreshTrigger={refreshTrigger}
            />
          )}

          {/* Keep ChatAgent mounted across section changes to preserve chat state and smooth navigation */}
          <div className={activeTab === "chat" ? "block" : "hidden"}>
            <ChatAgent
              currentUser={currentUser}
              refreshTrigger={refreshTrigger}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
