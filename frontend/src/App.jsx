import React, { useState, useEffect, useRef } from "react";
import { authFetch } from "./api";
import { supabase } from "./supabase";

import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StudioTab from "./components/StudioTab";
import OverviewTab from "./components/OverviewTab";
import ChannelsTab from "./components/ChannelsTab";
import PricingTab from "./components/PricingTab";
import AuthModal from "./components/AuthModal";
import LoginPage from "./components/LoginPage";
import Toast from "./components/Toast";

export default function App() {
  const [activeTab, setActiveTab] = useState("tab-studio");
  const [status, setStatus] = useState(null);
  const [channels, setChannels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [showLoginPage, setShowLoginPage] = useState(false);

  const [sourceMessages, setSourceMessages] = useState([]);
  const [destinationMessages, setDestinationMessages] = useState([]);

  // Independent Channel State (null until settings loaded from backend)
  const [activeSourceId, setActiveSourceId] = useState(null);
  const [activeDestId, setActiveDestId] = useState(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const activeSourceIdRef = useRef(activeSourceId);
  const activeDestIdRef = useRef(activeDestId);
  const sourceRequestIdRef = useRef(0);
  const destRequestIdRef = useRef(0);

  useEffect(() => { activeSourceIdRef.current = activeSourceId; }, [activeSourceId]);
  useEffect(() => { activeDestIdRef.current = activeDestId; }, [activeDestId]);

  const isSameChannelId = (idA, idB) => {
    if (!idA || !idB) return false;
    if (String(idA) === String(idB)) return true;
    const cleanA = String(idA).replace("-100", "").replace("-", "").trim();
    const cleanB = String(idB).replace("-100", "").replace("-", "").trim();
    return cleanA === cleanB;
  };

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const s = data.session;
      setSession(s);
      if (s?.access_token) {
        localStorage.setItem("sb_access_token", s.access_token);
        console.info("[AUTH] Session restored.");
      }
      setAuthLoading(false);
    }).catch(err => {
      console.error("[AUTH] Error getting session:", err);
      if (mounted) setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      if (newSession?.access_token) {
        localStorage.setItem("sb_access_token", newSession.access_token);
        setShowLoginPage(false);
      } else {
        localStorage.removeItem("sb_access_token");
        setShowLoginPage(true);
        setSettingsLoaded(false);
        setActiveSourceId(null);
        setActiveDestId(null);
      }
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const fetchStatus = async () => {
    try {
      const token = localStorage.getItem("sb_access_token") || session?.access_token;
      if (!token) return;
      const res = await authFetch("/api/status");
      if (res.status === 401) {
        setShowLoginPage(true);
        return;
      }
      const data = await res.json();
      setStatus(data);

      if (data?.settings) {
        const savedSource = data.settings.source_channel_id ?? "all";
        const savedDest = data.settings.destination_channel_id ?? "";

        if (activeSourceIdRef.current === null) {
          setActiveSourceId(savedSource);
          activeSourceIdRef.current = savedSource;
        }
        if (activeDestIdRef.current === null) {
          setActiveDestId(savedDest);
          activeDestIdRef.current = savedDest;
        }
        setSettingsLoaded(true);
      }
    } catch (err) {
      console.error("Error fetching status:", err);
    }
  };

  useEffect(() => {
    if (session?.access_token && !showLoginPage) {
      fetchStatus();
    }
  }, [session?.access_token, showLoginPage]);

  const fetchChannels = async () => {
    try {
      const token = localStorage.getItem("sb_access_token") || session?.access_token;
      if (!token) return;
      const res = await authFetch("/api/channels");
      if (res.status === 401) {
        setShowLoginPage(true);
        return;
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.channels) && data.channels.length > 0) {
        setChannels(data.channels);
      } else if (data.success && Array.isArray(data.channels)) {
        setChannels((prev) => (prev && prev.length > 0 ? prev : []));
      } else {
        console.warn("[fetchChannels] API returned non-success:", data.detail || data.error || "No channels available");
      }
    } catch (err) {
      console.error("Error fetching channels:", err);
    }
  };

  const fetchSourceMessages = async (channelId) => {
    try {
      const token = localStorage.getItem("sb_access_token") || session?.access_token;
      if (!token) return;

      const targetId = channelId !== undefined && channelId !== null
        ? String(channelId)
        : (activeSourceIdRef.current || status?.settings?.source_channel_id || "all");

      if (channelId !== undefined && channelId !== null) {
        setActiveSourceId(targetId);
        activeSourceIdRef.current = targetId;
      }

      if (!targetId || targetId === "undefined" || targetId === "null") {
        console.info("[SOURCE FETCH] Skipped: Invalid channel ID.");
        return;
      }

      const requestId = ++sourceRequestIdRef.current;
      const requestedChannelId = String(targetId);

      const url = `/api/messages?channel_id=${encodeURIComponent(requestedChannelId)}`;
      const res = await authFetch(url);
      if (res.status === 401) { setShowLoginPage(true); return; }
      const data = await res.json();

      if (requestId !== sourceRequestIdRef.current) {
        return;
      }

      const currentActive = activeSourceIdRef.current || status?.settings?.source_channel_id || "all";
      if (!isSameChannelId(currentActive, requestedChannelId)) {
        return;
      }

      if (res.ok && data.success && Array.isArray(data.messages)) {
        setSourceMessages(data.messages);
      }
    } catch (err) {
      console.error("[SOURCE FETCH] Request failed:", err);
    }
  };

  const fetchDestinationMessages = async (channelId) => {
    try {
      const token = localStorage.getItem("sb_access_token") || session?.access_token;
      if (!token) return;

      const targetId = channelId !== undefined && channelId !== null
        ? String(channelId)
        : (activeDestIdRef.current || status?.settings?.destination_channel_id || "");

      if (channelId !== undefined && channelId !== null) {
        setActiveDestId(targetId);
        activeDestIdRef.current = targetId;
      }

      if (!targetId || targetId === "undefined" || targetId === "null" || targetId === "all") {
        return;
      }

      const requestId = ++destRequestIdRef.current;
      const requestedChannelId = String(targetId);

      const url = `/api/messages?channel_id=${encodeURIComponent(requestedChannelId)}`;
      const res = await authFetch(url);
      if (res.status === 401) { setShowLoginPage(true); return; }
      const data = await res.json();

      if (requestId !== destRequestIdRef.current) {
        return;
      }

      const currentActive = activeDestIdRef.current || status?.settings?.destination_channel_id || "";
      if (!isSameChannelId(currentActive, requestedChannelId)) {
        return;
      }

      if (res.ok && data.success && Array.isArray(data.messages)) {
        setDestinationMessages(data.messages);
      }
    } catch (err) {
      console.error("[DEST FETCH] Request failed:", err);
    }
  };

  // Controlled Polling Interval
  useEffect(() => {
    if (!session || authLoading || showLoginPage || !settingsLoaded) return;

    const loadAllData = async () => {
      await fetchStatus();
      await fetchChannels();

      const currentSrc = activeSourceIdRef.current || "all";
      const currentDest = activeDestIdRef.current || "";

      if (currentSrc) await fetchSourceMessages(currentSrc);
      if (currentDest) await fetchDestinationMessages(currentDest);
    };

    loadAllData();
    const intervalId = window.setInterval(loadAllData, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [session?.access_token, authLoading, showLoginPage, settingsLoaded, activeSourceId, activeDestId]);

  const handleSaveRules = async (payload) => {
    try {
      const res = await authFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Engine Settings & Rules Saved Successfully!", "success");
        if (payload.source_channel_id !== undefined) {
          setActiveSourceId(payload.source_channel_id);
          activeSourceIdRef.current = payload.source_channel_id;
        }
        if (payload.destination_channel_id !== undefined) {
          setActiveDestId(payload.destination_channel_id);
          activeDestIdRef.current = payload.destination_channel_id;
        }
        fetchStatus();
      } else {
        showToast("Error saving settings: " + (data.detail || "Failed"), "error");
      }
    } catch (err) {
      console.error("[saveSettings] Error saving settings:", err);
      showToast("Save error: " + err, "error");
    }
  };

  const handleLogoutUser = async () => {
    localStorage.removeItem("sb_access_token");
    setSession(null);
    setShowLoginPage(true);
    setSettingsLoaded(false);
    setActiveSourceId(null);
    setActiveDestId(null);
    await supabase.auth.signOut().catch(() => {});
  };

  const handleDisconnectTelegram = async () => {
    try {
      const res = await authFetch("/api/auth/logout", { method: "POST" });
      const data = await res.json();
      if (res.ok && (data.success || data.connected === false)) {
        showToast("Telegram account disconnected successfully!", "info");
        setChannels([]);
        setSourceMessages([]);
        setDestinationMessages([]);
        fetchStatus();
      } else {
        showToast(data.detail || "Failed to disconnect Telegram account", "error");
      }
    } catch (err) {
      console.error("Error disconnecting Telegram:", err);
      showToast("Error disconnecting Telegram: " + err.message, "error");
    }
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#090d16", color: "#ffffff" }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "32px", color: "var(--primary-blue)" }}></i>
      </div>
    );
  }

  if (showLoginPage || !session) {
    return (
      <LoginPage
        onLoginSuccess={() => {
          setShowLoginPage(false);
          supabase.auth.getSession().then(({ data }) => {
            if (data.session) setSession(data.session);
          });
        }}
        onContinueDemo={() => {
          setShowLoginPage(false);
        }}
      />
    );
  }

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        status={status}
        onLogoutUser={handleLogoutUser}
      />

      <main className="main-content">
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          status={status}
          onOpenLogin={() => setIsAuthModalOpen(true)}
          onRefresh={() => {
            fetchStatus();
            fetchChannels();
            if (activeSourceId) fetchSourceMessages(activeSourceId);
            if (activeDestId) fetchDestinationMessages(activeDestId);
          }}
          onLogoutUser={handleLogoutUser}
          onDisconnectTelegram={handleDisconnectTelegram}
        />

        {activeTab === "tab-studio" && (
          <StudioTab
            status={status}
            channels={channels}
            sourceMessages={sourceMessages}
            destinationMessages={destinationMessages}
            onSaveRules={handleSaveRules}
            onFetchSourceMessages={fetchSourceMessages}
            onFetchDestinationMessages={fetchDestinationMessages}
            onOpenLogin={() => setIsAuthModalOpen(true)}
            onRefresh={() => {
              fetchStatus();
              fetchChannels();
              if (activeSourceId) fetchSourceMessages(activeSourceId);
              if (activeDestId) fetchDestinationMessages(activeDestId);
            }}
          />
        )}

        {activeTab === "tab-overview" && (
          <OverviewTab
            status={status}
            messages={messages}
            setActiveTab={setActiveTab}
            onOpenLogin={() => setIsAuthModalOpen(true)}
            onDisconnectTelegram={handleDisconnectTelegram}
          />
        )}

        {activeTab === "tab-channels" && (
          <ChannelsTab
            channels={channels}
            onFetchChannels={fetchChannels}
            status={status}
            onOpenLogin={() => setIsAuthModalOpen(true)}
          />
        )}

        {activeTab === "tab-pricing" && (
          <PricingTab
            status={status}
            onRefresh={fetchStatus}
            showToast={showToast}
          />
        )}
      </main>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onRefresh={fetchStatus}
        status={status}
      />

      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
