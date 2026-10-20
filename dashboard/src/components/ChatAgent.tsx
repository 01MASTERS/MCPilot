import React, { useState, useRef, useEffect, useMemo } from "react";
import type { User } from "../types";
import { sendChatMessage, fetchLlmModels } from "../services/api";
import { MarkdownMessage } from "./MarkdownMessage";
import { ConfirmModal } from "./ConfirmModal";
import {
  PaperPlaneRight,
  Lightning,
  CaretDown,
  CaretRight,
  ArrowsClockwise,
  User as UserIcon,
  Cpu,
  Sparkle,
  Gear,
  Eye,
  EyeSlash,
  WarningCircle,
  TextAlignLeft,
  ArrowsHorizontal,
  Plus,
  ClockCounterClockwise,
  Trash,
  X,
  MagnifyingGlass,
  ChatCircleDots,
} from "@phosphor-icons/react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCallsExecuted?: Array<{
    toolName: string;
    durationMs: number;
    status: string;
    args: any;
    result: any;
  }>;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

interface ChatAgentProps {
  currentUser: User;
}

function getInitialIntroMessage(user: User): ChatMessage {
  return {
    id: "intro",
    role: "assistant",
    content: `Hello **${user.username}**! I am your MCPilot Team Gateway autonomous chat agent. All tools I call execute with your identity (**${user.username}**, Role: **${user.role}**) and are logged in MariaDB.\n\nTry asking me to check store catalog products, inspect monthly revenue, or calculate operational delivery times!`,
    timestamp: new Date().toLocaleTimeString(),
  };
}

function createInitialSession(user: User, customTitle = "New Chat"): ChatSession {
  return {
    id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: customTitle,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [getInitialIntroMessage(user)],
  };
}

function formatSessionTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export const ChatAgent: React.FC<ChatAgentProps> = ({ currentUser }) => {
  const userStorageKey = currentUser.id || currentUser.username;
  const STORAGE_KEY_SESSIONS = `mcpilot_chat_sessions_${userStorageKey}`;
  const STORAGE_KEY_ACTIVE_ID = `mcpilot_active_session_${userStorageKey}`;

  // Multi-session chat history state
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load chat sessions from localStorage:", e);
    }
    return [createInitialSession(currentUser)];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    try {
      const storedId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
      if (storedId) {
        return storedId;
      }
    } catch (e) {}
    return sessions[0]?.id || "";
  });

  // UI state for session history drawer & modals
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [sessionToDelete, setSessionToDelete] = useState<ChatSession | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [clearAllModalOpen, setClearAllModalOpen] = useState(false);

  // Sync sessions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    } catch (e) {
      console.error("Failed to persist chat sessions:", e);
    }
  }, [sessions, STORAGE_KEY_SESSIONS]);

  // Sync active session ID to localStorage
  useEffect(() => {
    try {
      if (activeSessionId) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_ID, activeSessionId);
      }
    } catch (e) {}
  }, [activeSessionId, STORAGE_KEY_ACTIVE_ID]);

  // Reload sessions if currentUser changes
  useEffect(() => {
    const key = currentUser.id || currentUser.username;
    try {
      const raw = localStorage.getItem(`mcpilot_chat_sessions_${key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          const storedActive = localStorage.getItem(`mcpilot_active_session_${key}`);
          if (storedActive && parsed.some((s: ChatSession) => s.id === storedActive)) {
            setActiveSessionId(storedActive);
          } else {
            setActiveSessionId(parsed[0].id);
          }
          return;
        }
      }
    } catch (e) {
      console.error("Error loading user sessions:", e);
    }
    const initial = createInitialSession(currentUser);
    setSessions([initial]);
    setActiveSessionId(initial.id);
  }, [currentUser]);

  // Active session resolution
  const activeSession = useMemo(() => {
    return (
      sessions.find((s) => s.id === activeSessionId) ||
      sessions[0] ||
      createInitialSession(currentUser)
    );
  }, [sessions, activeSessionId, currentUser]);

  const messages = activeSession.messages;

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Model & Provider Configuration (saved in localStorage)
  const [provider, setProvider] = useState<"ollama" | "openai" | "openrouter" | "custom">(() => {
    return (localStorage.getItem("mcpilot_provider") as any) || "ollama";
  });

  const [baseUrl, setBaseUrl] = useState<string>(() => {
    return (
      localStorage.getItem("mcpilot_base_url") ||
      (provider === "ollama" ? "http://localhost:11434" : "https://api.openai.com/v1")
    );
  });

  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem("mcpilot_api_key") || "";
  });

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("mcpilot_model") || "nemotron-3-super:cloud";
  });

  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelsFetchError, setModelsFetchError] = useState<string | null>(null);

  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [expandedToolCards, setExpandedToolCards] = useState<Record<string, boolean>>({});
  const [wrapModes, setWrapModes] = useState<Record<string, boolean>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastFetchedKeyRef = useRef<string>("");

  // Keep input focused on mount and whenever loading finishes
  useEffect(() => {
    inputRef.current?.focus();
  }, [loading]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Model fetching function
  const fetchModelsFromEndpoint = async (
    targetProvider = provider,
    targetBaseUrl = baseUrl,
    targetApiKey = apiKey,
    isSilent = false
  ) => {
    if (!isSilent) setIsFetchingModels(true);
    setModelsFetchError(null);
    try {
      const res = await fetchLlmModels({
        provider: targetProvider,
        baseUrl: targetBaseUrl.trim() || undefined,
        apiKey: targetApiKey.trim() || undefined,
      });

      if (Array.isArray(res.models) && res.models.length > 0) {
        setAvailableModels(res.models);
        if (!res.models.includes(selectedModel)) {
          setSelectedModel(res.models[0]);
          localStorage.setItem("mcpilot_model", res.models[0]);
        }
      } else {
        setAvailableModels([]);
        if (!isSilent) {
          setModelsFetchError("No models found at this endpoint.");
        }
      }
    } catch (err: any) {
      if (!isSilent) {
        console.warn("Failed to fetch models:", err.message);
        setModelsFetchError(err.message || "Failed to connect to model provider");
      }
    } finally {
      if (!isSilent) setIsFetchingModels(false);
    }
  };

  // 1. Silent periodic fetch for local Ollama models (every 30s)
  useEffect(() => {
    if (provider !== "ollama") return;

    fetchModelsFromEndpoint("ollama", baseUrl, apiKey, false);

    const interval = setInterval(() => {
      fetchModelsFromEndpoint("ollama", baseUrl, apiKey, true);
    }, 30000);

    return () => clearInterval(interval);
  }, [provider, baseUrl]);

  // 2. Remote providers: Fetch models ONLY once a new API key is entered
  useEffect(() => {
    if (provider === "ollama") return;
    const cleanKey = apiKey.trim();
    if (!cleanKey) return;
    if (cleanKey === lastFetchedKeyRef.current) return;

    const timer = setTimeout(() => {
      lastFetchedKeyRef.current = cleanKey;
      fetchModelsFromEndpoint(provider, baseUrl, cleanKey, false);
    }, 800);

    return () => clearTimeout(timer);
  }, [apiKey, provider, baseUrl]);

  const handleProviderChange = (newProvider: "ollama" | "openai" | "openrouter" | "custom") => {
    setProvider(newProvider);
    localStorage.setItem("mcpilot_provider", newProvider);

    let defaultBase = baseUrl;
    if (newProvider === "ollama") defaultBase = "http://localhost:11434";
    else if (newProvider === "openai") defaultBase = "https://api.openai.com/v1";
    else if (newProvider === "openrouter") defaultBase = "https://openrouter.ai/api/v1";

    setBaseUrl(defaultBase);
    localStorage.setItem("mcpilot_base_url", defaultBase);

    if (newProvider === "ollama") {
      fetchModelsFromEndpoint(newProvider, defaultBase, apiKey, false);
    } else if (apiKey.trim()) {
      lastFetchedKeyRef.current = apiKey.trim();
      fetchModelsFromEndpoint(newProvider, defaultBase, apiKey.trim(), false);
    } else {
      setAvailableModels([]);
    }
  };

  const handleBaseUrlChange = (val: string) => {
    setBaseUrl(val);
    localStorage.setItem("mcpilot_base_url", val);
  };

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    localStorage.setItem("mcpilot_api_key", val);
  };

  const handleApiKeyBlur = () => {
    if (provider !== "ollama" && apiKey.trim() && apiKey.trim() !== lastFetchedKeyRef.current) {
      lastFetchedKeyRef.current = apiKey.trim();
      fetchModelsFromEndpoint(provider, baseUrl, apiKey.trim(), false);
    }
  };

  const handleModelChange = (val: string) => {
    setSelectedModel(val);
    localStorage.setItem("mcpilot_model", val);
  };

  const toggleToolCard = (key: string) => {
    setExpandedToolCards((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleWrapMode = (cardKey: string) => {
    setWrapModes((prev) => ({
      ...prev,
      [cardKey]: prev[cardKey] === undefined ? false : !prev[cardKey],
    }));
  };

  // Session Handlers
  const handleNewChat = () => {
    const newSession = createInitialSession(currentUser);
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleDeleteSessionClick = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDelete(session);
    setDeleteModalOpen(true);
  };

  const confirmDeleteSession = () => {
    if (!sessionToDelete) return;
    const remaining = sessions.filter((s) => s.id !== sessionToDelete.id);
    if (remaining.length === 0) {
      const fresh = createInitialSession(currentUser);
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
    } else {
      setSessions(remaining);
      if (activeSessionId === sessionToDelete.id) {
        setActiveSessionId(remaining[0].id);
      }
    }
    setDeleteModalOpen(false);
    setSessionToDelete(null);
  };

  const confirmClearAll = () => {
    const fresh = createInitialSession(currentUser);
    setSessions([fresh]);
    setActiveSessionId(fresh.id);
    setClearAllModalOpen(false);
  };

  const handleResetCurrentSession = () => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSession.id) return s;
        return {
          ...s,
          title: "New Chat",
          updatedAt: new Date().toISOString(),
          messages: [
            {
              id: `reset_${Date.now()}`,
              role: "assistant",
              content: `Conversation reset. Ready for queries as **${currentUser.username}** (${currentUser.role}).`,
              timestamp: new Date().toLocaleTimeString(),
            },
          ],
        };
      })
    );
    inputRef.current?.focus();
  };

  // Send message with session binding
  const handleSend = async (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim() || loading) return;

    const targetSessionId = activeSession.id;
    const userMessage: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: "user",
      content: text.trim(),
      timestamp: new Date().toLocaleTimeString(),
    };

    // Update active session with the user message and auto-title if needed
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== targetSessionId) return s;
        let title = s.title;
        if (title === "New Chat" || !title) {
          title = text.trim().slice(0, 32) + (text.trim().length > 32 ? "..." : "");
        }
        return {
          ...s,
          title,
          updatedAt: new Date().toISOString(),
          messages: [...s.messages, userMessage],
        };
      })
    );

    setInput("");
    setLoading(true);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    try {
      const chatHistory = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await sendChatMessage(chatHistory, {
        provider,
        model: selectedModel,
        baseUrl: baseUrl.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
      });

      const assistantMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: "assistant",
        content: response.content,
        toolCallsExecuted: response.toolCallsExecuted,
        timestamp: new Date().toLocaleTimeString(),
      };

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          return {
            ...s,
            updatedAt: new Date().toISOString(),
            messages: [...s.messages, assistantMsg],
          };
        })
      );
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: "assistant",
        content: `Error invoking gateway agent: ${err.message || String(err)}`,
        timestamp: new Date().toLocaleTimeString(),
      };

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          return {
            ...s,
            updatedAt: new Date().toISOString(),
            messages: [...s.messages, errorMsg],
          };
        })
      );
    } finally {
      setLoading(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  const filteredSessions = useMemo(() => {
    if (!historySearch.trim()) return sessions;
    const q = historySearch.toLowerCase();
    return sessions.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      s.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [sessions, historySearch]);

  const suggestionChips = [
    "List top store products",
    "Check gross revenue this month",
    "What is our store time?",
    "Query recent orders",
  ];

  return (
    <div className="flex h-[calc(100vh-7rem)] max-w-6xl mx-auto geist-card overflow-hidden relative">
      {/* Collapsible Session History Sidebar Drawer */}
      {showHistory && (
        <div className="w-72 bg-[#080808] border-r border-[#222222] flex flex-col h-full flex-shrink-0 z-10 animate-in slide-in-from-left duration-150">
          {/* History Header */}
          <div className="p-3 border-b border-[#222222] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClockCounterClockwise size={15} className="text-[#00DF8F]" weight="bold" />
              <span className="text-xs font-semibold text-[#EDEDED]">Chat Sessions</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#1A1A1A] text-[#888888] border border-[#2A2A2A]">
                {sessions.length}
              </span>
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="text-[#666666] hover:text-[#EDEDED] p-1 rounded transition-colors"
              title="Close history panel"
            >
              <X size={14} />
            </button>
          </div>

          {/* New Chat Action */}
          <div className="p-2.5 border-b border-[#1A1A1A]">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#111111] hover:bg-[#1A1A1A] border border-[#262626] hover:border-[#00DF8F]/50 text-white rounded text-xs font-medium transition-all"
            >
              <Plus size={14} weight="bold" className="text-[#00DF8F]" />
              <span>New Chat</span>
            </button>
          </div>

          {/* Search Filter */}
          <div className="px-2.5 py-2 border-b border-[#1A1A1A]">
            <div className="relative">
              <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#666666]" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full bg-black border border-[#222222] rounded pl-8 pr-2.5 py-1 text-[11px] text-[#EDEDED] font-mono placeholder-[#555555] focus:outline-none focus:border-[#00DF8F]"
              />
            </div>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredSessions.length === 0 ? (
              <div className="p-4 text-center text-xs text-[#555555] font-mono">
                {historySearch ? "No matching sessions" : "No chat history"}
              </div>
            ) : (
              filteredSessions.map((s) => {
                const isActive = s.id === activeSession.id;
                const msgCount = s.messages.filter((m) => m.role === "user").length;
                return (
                  <div
                    key={s.id}
                    onClick={() => handleSelectSession(s.id)}
                    className={`group flex items-center justify-between p-2.5 rounded-md cursor-pointer transition-colors border ${
                      isActive
                        ? "bg-[#111111] border-[#00DF8F]/40 text-white shadow-sm"
                        : "bg-transparent border-transparent hover:bg-[#111111] hover:border-[#222222] text-[#AAAAAA] hover:text-[#EDEDED]"
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <ChatCircleDots
                          size={13}
                          className={`flex-shrink-0 ${isActive ? "text-[#00DF8F]" : "text-[#666666]"}`}
                          weight={isActive ? "fill" : "regular"}
                        />
                        <div className="text-xs font-medium truncate">{s.title}</div>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-[#666666]">
                        <span>{formatSessionTime(s.updatedAt)}</span>
                        <span>•</span>
                        <span>{msgCount} query{msgCount === 1 ? "" : "s"}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteSessionClick(s, e)}
                      className="opacity-0 group-hover:opacity-100 text-[#666666] hover:text-[#EE0000] p-1 rounded transition-opacity"
                      title="Delete session"
                    >
                      <Trash size={13} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* History Footer: Clear All */}
          {sessions.length > 1 && (
            <div className="p-2 border-t border-[#1A1A1A]">
              <button
                onClick={() => setClearAllModalOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono text-[#888888] hover:text-[#EE0000] hover:bg-[#1A1111] rounded transition-colors"
              >
                <Trash size={12} />
                <span>Clear All Sessions</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Chat Pane */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-black">
        {/* Workspace Topbar */}
        <div className="p-3 bg-[#0D0D0D] border-b border-[#222222] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* History Toggle Button */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`px-2.5 py-1 rounded border text-xs font-mono flex items-center gap-1.5 transition-colors ${
                showHistory
                  ? "bg-[#1E1E1E] text-[#00DF8F] border-[#00DF8F]/40"
                  : "bg-black text-[#888888] hover:text-white border-[#222222]"
              }`}
              title="Toggle chat sessions history"
            >
              <ClockCounterClockwise size={13} weight="bold" />
              <span>History</span>
              <span className="text-[10px] px-1 rounded bg-[#1A1A1A] text-[#888888]">
                {sessions.length}
              </span>
            </button>

            {/* New Chat Button */}
            <button
              onClick={handleNewChat}
              className="px-2.5 py-1 rounded border border-[#222222] bg-black text-[#888888] hover:text-[#00DF8F] hover:border-[#00DF8F]/40 text-xs font-mono flex items-center gap-1 transition-colors"
              title="Start a new chat session"
            >
              <Plus size={13} weight="bold" />
              <span className="hidden sm:inline">New Chat</span>
            </button>

            {/* Active Session Title Pill */}
            <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#0A0A0A] border border-[#222222] text-[11px] font-mono text-[#CCCCCC] max-w-[200px] truncate">
              <span className="text-[#00DF8F]">💬</span>
              <span className="truncate">{activeSession.title}</span>
            </div>

            {/* Provider Pill Switcher */}
            <div className="flex items-center bg-black p-0.5 rounded border border-[#222222] ml-1">
              {(["ollama", "openai", "openrouter", "custom"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`px-2 py-1 rounded text-[11px] font-mono capitalize transition-colors ${
                    provider === p
                      ? "bg-[#1E1E1E] text-white font-medium"
                      : "text-[#666666] hover:text-[#CCCCCC]"
                  }`}
                >
                  {p === "ollama" ? "Ollama (Local)" : p}
                </button>
              ))}
            </div>

            {/* Model Selector Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono text-[#666666] uppercase flex items-center gap-1">
                Model:
                {isFetchingModels && (
                  <span
                    className="w-2.5 h-2.5 border-2 border-[#00DF8F] border-t-transparent rounded-full animate-spin inline-block ml-0.5"
                    title="Updating models..."
                  />
                )}
              </span>
              {availableModels.length > 0 ? (
                <select
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="bg-black border border-[#222222] rounded px-2.5 py-1 text-xs text-[#EDEDED] font-mono focus:outline-none focus:border-[#00DF8F] max-w-[200px]"
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  placeholder={
                    provider === "ollama" ? "e.g. gemma4:cloud" : "Enter API key in settings..."
                  }
                  className="bg-black border border-[#222222] rounded px-2.5 py-1 text-xs text-[#EDEDED] font-mono focus:outline-none focus:border-[#00DF8F] w-44"
                />
              )}
            </div>

            {/* Settings Toggle */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded border transition-colors ${
                showSettings
                  ? "bg-[#1E1E1E] text-[#00DF8F] border-[#00DF8F]/40"
                  : "bg-black text-[#888888] hover:text-white border-[#222222]"
              }`}
              title="Configure endpoint URL and API Key"
            >
              <Gear size={14} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Caller Identity Attribution Pill */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black border border-[#222222] text-[11px] text-[#888888]">
              <UserIcon size={12} className="text-[#00DF8F]" weight="bold" />
              <span>Caller:</span>
              <span className="text-white font-medium">{currentUser.username}</span>
              <span className="text-[#666666] font-mono uppercase text-[10px]">
                ({currentUser.role})
              </span>
            </div>

            {/* Reset Current Session Conversation */}
            <button
              onClick={handleResetCurrentSession}
              className="text-xs text-[#888888] hover:text-[#EDEDED] flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-black"
              title="Reset current session messages"
            >
              <ArrowsClockwise size={13} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Expandable Model & API Key Configuration Drawer */}
        {showSettings && (
          <div className="p-3.5 bg-[#0A0A0A] border-b border-[#222222] space-y-3 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-mono text-[#888888] mb-1">
                  Base URL ({provider})
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => handleBaseUrlChange(e.target.value)}
                  placeholder={
                    provider === "ollama" ? "http://localhost:11434" : "https://api.openai.com/v1"
                  }
                  className="w-full px-2.5 py-1.5 bg-black border border-[#222222] rounded text-xs text-[#EDEDED] font-mono focus:outline-none focus:border-[#00DF8F]"
                />
                <p className="text-[10px] text-[#666666] mt-0.5">
                  {provider === "ollama"
                    ? "Localhost Ollama is automatically forwarded from within containers."
                    : "Standard OpenAI-compatible API base URL."}
                </p>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-mono text-[#888888] mb-1">
                  API Key {provider === "ollama" ? "(Optional for local Ollama)" : "(Required for remote)"}
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    onBlur={handleApiKeyBlur}
                    placeholder="sk-..."
                    className="w-full pl-2.5 pr-8 py-1.5 bg-black border border-[#222222] rounded text-xs text-[#EDEDED] font-mono focus:outline-none focus:border-[#00DF8F]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#666666] hover:text-white"
                  >
                    {showApiKey ? <EyeSlash size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <p className="text-[10px] text-[#666666] mt-0.5">
                  {provider !== "ollama"
                    ? "Models will auto-fetch once a new key is entered."
                    : "Saved securely in browser local storage."}
                </p>
              </div>
            </div>

            {modelsFetchError && (
              <div className="p-2 bg-red-950/40 border border-[#EE0000]/40 rounded text-xs text-[#EE0000] flex items-center gap-2">
                <WarningCircle size={14} weight="fill" className="flex-shrink-0" />
                <span>{modelsFetchError}</span>
              </div>
            )}
          </div>
        )}

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 bg-black">
          {messages.map((m) => {
            const isUser = m.role === "user";

            return (
              <div
                key={m.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`flex gap-3 max-w-3xl ${
                    isUser ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                      isUser
                        ? "bg-[#1A1A1A] text-white border border-[#333333]"
                        : "bg-[#0A0A0A] text-[#00DF8F] border border-[#222222]"
                    }`}
                  >
                    {isUser ? <UserIcon size={14} /> : <Cpu size={14} weight="bold" />}
                  </div>

                  {/* Message Body */}
                  <div className="space-y-3 max-w-full overflow-hidden">
                    {/* Inline Tool Execution Cards */}
                    {!isUser && m.toolCallsExecuted && m.toolCallsExecuted.length > 0 && (
                      <div className="space-y-2">
                        {m.toolCallsExecuted.map((tc, idx) => {
                          const cardKey = `${m.id}_tc_${idx}`;
                          const isExpanded = Boolean(expandedToolCards[cardKey]);
                          const isSuccess = tc.status === "success";
                          const isWrapped = wrapModes[cardKey] !== false;

                          return (
                            <div
                              key={cardKey}
                              className="bg-[#0A0A0A] border border-[#222222] hover:border-[#333333] rounded-md p-2.5 transition-colors text-xs max-w-full overflow-hidden"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <Lightning
                                    size={14}
                                    weight="fill"
                                    className={isSuccess ? "text-[#00DF8F]" : "text-[#EE0000]"}
                                  />
                                  <span className="font-mono text-[11px] font-semibold text-[#EDEDED]">
                                    {tc.toolName}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2.5">
                                  <span className="font-mono text-[10px] text-[#888888]">
                                    ⏱ {tc.durationMs}ms
                                  </span>
                                  <span
                                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                                      isSuccess
                                        ? "bg-emerald-950/60 text-[#00DF8F]"
                                        : "bg-red-950/60 text-[#EE0000]"
                                    }`}
                                  >
                                    {isSuccess ? "Success" : "Error"}
                                  </span>
                                  <button
                                    onClick={() => toggleToolCard(cardKey)}
                                    className="text-[#666666] hover:text-[#EDEDED] flex items-center gap-0.5 text-[10px] font-mono"
                                  >
                                    <span>{isExpanded ? "Hide" : "Inspect"}</span>
                                    {isExpanded ? <CaretDown size={11} /> : <CaretRight size={11} />}
                                  </button>
                                </div>
                              </div>

                              {/* Collapsible JSON Accordion */}
                              {isExpanded && (
                                <div className="mt-2.5 pt-2 border-t border-[#1A1A1A] space-y-2">
                                  {/* Arguments */}
                                  <div>
                                    <div className="flex items-center justify-between text-[10px] uppercase font-mono text-[#666666] mb-1">
                                      <span>Arguments Sent</span>
                                    </div>
                                    <pre
                                      className={`p-2 bg-black rounded border border-[#1A1A1A] font-mono text-[10px] text-[#00DF8F] max-h-36 overflow-y-auto ${
                                        isWrapped
                                          ? "whitespace-pre-wrap break-words break-all"
                                          : "whitespace-pre overflow-x-auto"
                                      }`}
                                    >
                                      {JSON.stringify(tc.args || {}, null, 2)}
                                    </pre>
                                  </div>

                                  {/* Raw Gateway Result */}
                                  <div>
                                    <div className="flex items-center justify-between text-[10px] uppercase font-mono text-[#666666] mb-1">
                                      <span>Raw Gateway Result</span>
                                      <button
                                        type="button"
                                        onClick={() => toggleWrapMode(cardKey)}
                                        className="flex items-center gap-1 text-[10px] font-mono text-[#888888] hover:text-[#00DF8F] transition-colors"
                                        title="Toggle Word Wrap vs Horizontal Scroll"
                                      >
                                        {isWrapped ? (
                                          <>
                                            <ArrowsHorizontal size={11} />
                                            <span>Scroll Mode</span>
                                          </>
                                        ) : (
                                          <>
                                            <TextAlignLeft size={11} />
                                            <span>Wrap Mode</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    <pre
                                      className={`p-2 bg-black rounded border border-[#1A1A1A] font-mono text-[10px] text-[#CCCCCC] max-h-60 overflow-y-auto ${
                                        isWrapped
                                          ? "whitespace-pre-wrap break-words break-all"
                                          : "whitespace-pre overflow-x-auto"
                                      }`}
                                    >
                                      {JSON.stringify(tc.result || {}, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Bubble Text */}
                    <div
                      className={`p-4 rounded-lg text-xs leading-relaxed max-w-full overflow-hidden ${
                        isUser
                          ? "bg-[#111111] border border-[#222222] text-[#EDEDED]"
                          : "bg-[#0A0A0A] border border-[#1F1F1F] text-[#CCCCCC]"
                      }`}
                    >
                      <MarkdownMessage
                        content={m.content}
                        isUser={isUser}
                        modelBadge={!isUser ? selectedModel : undefined}
                      />
                    </div>

                    <div className="text-[10px] font-mono text-[#555555] px-1">
                      {m.timestamp}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-[#888888] font-mono p-2">
              <Sparkle size={14} className="text-[#00DF8F] animate-spin" weight="bold" />
              <span>Invoking {selectedModel} & executing federated MCP tools...</span>
            </div>
          )}

          <div ref={scrollRef} />
        </div>

        {/* Suggestion Chips & Chat Input */}
        <div className="p-4 bg-[#0A0A0A] border-t border-[#222222] space-y-3">
          {/* Quick Suggestion Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[10px] uppercase font-mono text-[#666666] flex-shrink-0 mr-1">
              Suggestions:
            </span>
            {suggestionChips.map((chip) => (
              <button
                key={chip}
                onClick={() => handleSend(chip)}
                disabled={loading}
                className="px-2.5 py-1 bg-black hover:bg-[#141414] border border-[#222222] hover:border-[#333333] rounded-md text-[11px] text-[#AAAAAA] hover:text-white transition-colors flex-shrink-0"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask MCPilot agent as ${currentUser.username}...`}
              className="flex-1 px-3.5 py-2.5 bg-black border border-[#222222] rounded-md text-xs text-[#EDEDED] placeholder-[#555555] focus:outline-none focus:border-[#00DF8F] transition-colors"
            />

            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="geist-button-primary py-2.5 px-4 text-xs font-semibold"
            >
              <span>Send</span>
              <PaperPlaneRight size={14} weight="bold" />
            </button>
          </form>
        </div>
      </div>

      {/* Styled Native Delete Session Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Delete Chat Session"
        description={`Are you sure you want to delete "${sessionToDelete?.title || "this session"}"? This conversation history cannot be recovered.`}
        confirmLabel="Delete Session"
        variant="danger"
        onConfirm={confirmDeleteSession}
        onCancel={() => {
          setDeleteModalOpen(false);
          setSessionToDelete(null);
        }}
      />

      {/* Styled Native Clear All Sessions Confirmation Modal */}
      <ConfirmModal
        isOpen={clearAllModalOpen}
        title="Clear All Chat Sessions"
        description="Are you sure you want to clear all chat sessions? All saved conversation histories will be permanently removed."
        confirmLabel="Clear All"
        variant="danger"
        onConfirm={confirmClearAll}
        onCancel={() => setClearAllModalOpen(false)}
      />
    </div>
  );
};
