import React, { useState, useEffect, useRef } from "react";
import { authFetch } from "./api";
import { supabase } from "./supabase";

import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StudioTab from "./components/StudioTab";
import OverviewTab from "./components/OverviewTab";
import ChannelsTab from "./components/ChannelsTab";
import RulesTab from "./components/RulesTab";
import FeedTab from "./components/FeedTab";
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
  const [activeSourceId, setActiveSourceId] = useState(null);
  const [activeDestId, setActiveDestId] = useState(null);

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
        console.info("[AUTH] Session restored. Access token prefix:", `${s.access_token.slice(0, 10)}...`);
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
      if (data?.settings?.source_channel_id && !activeSourceIdRef.current) {
        setActiveSourceId(data.settings.source_channel_id);
        activeSourceIdRef.current = data.settings.source_channel_id;
      }
      if (data?.settings?.destination_channel_id && !activeDestIdRef.current) {
        setActiveDestId(data.settings.destination_channel_id);
        activeDestIdRef.current = data.settings.destination_channel_id;
      }
    } catch (err) {
      console.error("Error fetching status:", err);
    }
  };

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
      if (data.success && Array.isArray(data.channels)) {
        setChannels(data.channels);
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

      // Guard 1: Ignore stale out-of-order response
      if (requestId !== sourceRequestIdRef.current) {
        console.warn("[SOURCE FETCH] Ignoring stale out-of-order response", { requestedChannelId, requestId, current: sourceRequestIdRef.current });
        return;
      }

      // Guard 2: Ignore response if active channel changed
      const currentActive = activeSourceIdRef.current || status?.settings?.source_channel_id || "all";
      if (!isSameChannelId(currentActive, requestedChannelId)) {
        console.warn("[SOURCE FETCH] Ignoring stale response for inactive channel", { requestedChannelId, currentActive });
        return;
      }

      console.log("[SOURCE FETCH]", {
        channelId: requestedChannelId,
        channelName: data.chat_name,
        count: data.messages?.length
      });

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
        console.info("[DEST FETCH] Skipped: Invalid destination channel ID.");
        return;
      }

      const requestId = ++destRequestIdRef.current;
      const requestedChannelId = String(targetId);

      const url = `/api/messages?channel_id=${encodeURIComponent(requestedChannelId)}`;
      const res = await authFetch(url);
      if (res.status === 401) { setShowLoginPage(true); return; }
      const data = await res.json();

      // Guard 1: Ignore stale out-of-order response
      if (requestId !== destRequestIdRef.current) {
        console.warn("[DEST FETCH] Ignoring stale out-of-order response", { requestedChannelId, requestId, current: destRequestIdRef.current });
        return;
      }

      // Guard 2: Ignore response if active channel changed
      const currentActive = activeDestIdRef.current || status?.settings?.destination_channel_id || "";
      if (!isSameChannelId(currentActive, requestedChannelId)) {
        console.warn("[DEST FETCH] Ignoring stale response for inactive channel", { requestedChannelId, currentActive });
        return;
      }

      console.log("[DEST FETCH]", {
        channelId: requestedChannelId,
        channelName: data.chat_name,
        count: data.messages?.length
      });

      if (res.ok && data.success && Array.isArray(data.messages)) {
        setDestinationMessages(data.messages);
      }
    } catch (err) {
      console.error("[DEST FETCH] Request failed:", err);
    }
  };

  useEffect(() => {
    if (!session || authLoading || showLoginPage) return;

    const loadAllData = async () => {
      console.info("[polling function] Running polling cycle...");
      await fetchStatus();
      await fetchChannels();

      const currentSrc = activeSourceIdRef.current || status?.settings?.source_channel_id || "all";
      const currentDest = activeDestIdRef.current || status?.settings?.destination_channel_id;

      if (currentSrc) await fetchSourceMessages(currentSrc);
      if (currentDest) await fetchDestinationMessages(currentDest);
    };

    loadAllData();

    const intervalId = window.setInterval(loadAllData, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [session?.access_token, authLoading, showLoginPage]);

  const handleSaveRules = async (payload) => {
    console.info("[saveSettings] Invoked with payload:", payload);
    try {
      const res = await authFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      console.info(`[saveSettings] Response status: ${res.status}`, data);
      if (res.ok && data.success) {
        console.info("[saveSettings] Save successful:", data.settings);
        showToast("Engine Settings & Rules Saved Successfully!", "success");
        if (payload.source_channel_id) {
          setActiveSourceId(payload.source_channel_id);
          fetchSourceMessages(payload.source_channel_id);
        }
        if (payload.destination_channel_id) {
          setActiveDestId(payload.destination_channel_id);
          fetchDestinationMessages(payload.destination_channel_id);
        }
        fetchStatus();
      } else {
        console.error("[saveSettings] Save failed:", data.detail || data.error);
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
    await supabase.auth.signOut().catch(() => {});
  };

  const handleDisconnectTelegram = async () => {
    try {
      const res = await authFetch("/api/auth/logout", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
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

        {activeTab === "tab-rules" && (
          <RulesTab
            status={status}
            onSaveRules={handleSaveRules}
          />
        )}

        {activeTab === "tab-feed" && (
          <FeedTab
            messages={messages}
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
