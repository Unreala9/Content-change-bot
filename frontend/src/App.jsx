import React, { useState, useEffect } from "react";
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
      const res = await authFetch("/api/status");
      if (res.status === 401) {
        setShowLoginPage(true);
        return;
      }
      const data = await res.json();
      setStatus(data);
      if (!activeSourceId && data?.settings?.source_channel_id) {
        setActiveSourceId(data.settings.source_channel_id);
      }
      if (!activeDestId && data?.settings?.destination_channel_id) {
        setActiveDestId(data.settings.destination_channel_id);
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
      }
    } catch (err) {
      console.error("Error fetching channels:", err);
    }
  };

  const fetchSourceMessages = async (channelId) => {
    try {
      const token = localStorage.getItem("sb_access_token") || session?.access_token;
      if (!token) return;
      const targetId = channelId !== undefined ? channelId : (activeSourceId || status?.settings?.source_channel_id || "all");
      if (channelId !== undefined && channelId !== null) setActiveSourceId(channelId);

      if (!targetId || targetId === "all") {
        console.info("[fetchSourceMessages] Skipped: No target channel ID specified.");
        return;
      }

      const url = `/api/messages?channel_id=${encodeURIComponent(targetId)}`;
      console.info(`[fetchSourceMessages] Fetching source stream for ${targetId}: ${url}`);

      const res = await authFetch(url);
      if (res.status === 401) { setShowLoginPage(true); return; }
      const data = await res.json();
      console.info(`[fetchSourceMessages] Response status: ${res.status}, success: ${data.success}, count: ${data.messages?.length || 0}`);

      if (data.success && Array.isArray(data.messages) && data.messages.length > 0) {
        console.info(`[setSourceMessages] Updating sourceMessages with ${data.messages.length} items`);
        setSourceMessages(data.messages);
      } else if (!data.success) {
        console.warn(`[fetchSourceMessages] Error from API: ${data.error || data.detail}. Retaining existing stream.`);
      }
    } catch (err) {
      console.error("[fetchSourceMessages] Request failed:", err, "Retaining existing stream.");
    }
  };

  const fetchDestinationMessages = async (channelId) => {
    try {
      const token = localStorage.getItem("sb_access_token") || session?.access_token;
      if (!token) return;
      const targetId = channelId !== undefined ? channelId : (activeDestId || status?.settings?.destination_channel_id || "");
      if (channelId !== undefined && channelId !== null) setActiveDestId(channelId);

      if (!targetId) {
        console.info("[fetchDestinationMessages] Skipped: No target destination ID specified.");
        return;
      }

      const url = `/api/messages?channel_id=${encodeURIComponent(targetId)}`;
      console.info(`[fetchDestinationMessages] Fetching destination stream for ${targetId}: ${url}`);

      const res = await authFetch(url);
      if (res.status === 401) { setShowLoginPage(true); return; }
      const data = await res.json();
      console.info(`[fetchDestinationMessages] Response status: ${res.status}, success: ${data.success}, count: ${data.messages?.length || 0}`);

      if (data.success && Array.isArray(data.messages) && data.messages.length > 0) {
        console.info(`[setDestinationMessages] Updating destinationMessages with ${data.messages.length} items`);
        setDestinationMessages(data.messages);
      } else if (!data.success) {
        console.warn(`[fetchDestinationMessages] Error from API: ${data.error || data.detail}. Retaining existing stream.`);
      }
    } catch (err) {
      console.error("[fetchDestinationMessages] Request failed:", err, "Retaining existing stream.");
    }
  };

  useEffect(() => {
    if (!session || authLoading || showLoginPage) return;

    const loadAllData = async () => {
      console.info("[polling function] Running polling cycle...");
      await fetchStatus();
      await fetchChannels();
      const currentSrc = activeSourceId || status?.settings?.source_channel_id;
      const currentDest = activeDestId || status?.settings?.destination_channel_id;
      if (currentSrc && currentSrc !== "all") await fetchSourceMessages(currentSrc);
      if (currentDest) await fetchDestinationMessages(currentDest);
    };

    loadAllData();

    const intervalId = window.setInterval(loadAllData, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [session?.access_token, authLoading, showLoginPage, activeSourceId, activeDestId]);

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
        fetchStatus();
        if (payload.source_channel_id) {
          fetchSourceMessages(payload.source_channel_id);
        }
        if (payload.destination_channel_id) {
          fetchDestinationMessages(payload.destination_channel_id);
        }
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
          />
        )}

        {activeTab === "tab-channels" && (
          <ChannelsTab
            channels={channels}
            onFetchChannels={fetchChannels}
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
