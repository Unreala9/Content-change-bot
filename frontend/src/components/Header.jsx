import React from "react";

export default function Header({ activeTab, setActiveTab, status, onOpenLogin, onRefresh, onLogoutUser }) {
  const isAuthorized = status?.authorized;
  const isSessionExpired = status?.session_expired;
  const tgUser = status?.user;
  const userEmail = status?.account?.email || "shwetchourey3@gmail.com";

  const tabTitles = {
    "tab-studio": { title: "Side-by-Side Sync Studio", sub: "Source Channel Extract \u2192 Live Modifier Engine \u2192 Destination Channel Paste" },
    "tab-overview": { title: "Dashboard Overview & Stats", sub: "Real-time Telegram message listener & n8n webhook automation" },
    "tab-channels": { title: "Dialogs & Channels Matrix", sub: "Inspect, search and manage all accessible Telegram channels and chats" },
    "tab-rules": { title: "n8n & Rules Engine Config", sub: "Configure global transformation rules, replacements, and webhook targets" },
    "tab-feed": { title: "Live Sync Feed", sub: "Real-time feed of intercepted and transformed Telegram messages" },
    "tab-pricing": { title: "Pricing & Subscription Plans", sub: "Select a plan to enable real-time Telegram channel syncing" }
  };

  const currentHeader = tabTitles[activeTab] || tabTitles["tab-studio"];

  return (
    <header className="top-header" style={{ marginBottom: "20px", paddingBottom: "14px" }}>
      <div className="header-title">
        <h1 style={{ fontSize: "20px", fontWeight: "700" }}>{currentHeader.title}</h1>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{currentHeader.sub}</p>
      </div>

      <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "nowrap" }}>
        {isAuthorized ? (
          <div className="connection-badge status-online" style={{ background: "rgba(16, 185, 129, 0.15)", color: "var(--accent-green)", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "6px 12px", fontSize: "12px", whiteSpace: "nowrap" }}>
            <i className="fa-solid fa-wifi"></i>
            <span>{tgUser?.first_name ? `Connected: ${tgUser.first_name}` : "Connected"}</span>
          </div>
        ) : isSessionExpired ? (
          <button
            className="btn btn-warning btn-sm"
            style={{ background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", color: "#ffffff", border: "none", gap: "6px", whiteSpace: "nowrap", padding: "6px 14px", fontSize: "12px" }}
            onClick={onOpenLogin}
          >
            <i className="fa-solid fa-triangle-exclamation"></i> Reconnect {tgUser?.first_name || "Telegram"}
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" style={{ whiteSpace: "nowrap", padding: "6px 14px", fontSize: "12px" }} onClick={onOpenLogin}>
            <i className="fa-paper-plane fa-solid"></i> Connect Telegram
          </button>
        )}

        <button className="btn btn-primary btn-sm" style={{ background: "var(--primary-blue)", whiteSpace: "nowrap", padding: "6px 12px", fontSize: "12px" }} onClick={onRefresh} title="Refresh Feeds">
          <i className="fa-solid fa-arrows-rotate"></i> Refresh
        </button>

        <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500", whiteSpace: "nowrap" }}>
          {userEmail}
        </span>

        <button className="btn btn-danger btn-sm" style={{ padding: "6px 12px", borderRadius: "8px", whiteSpace: "nowrap", fontSize: "12px" }} onClick={onLogoutUser}>
          <i className="fa-solid fa-right-from-bracket"></i> Logout
        </button>
      </div>
    </header>
  );
}
