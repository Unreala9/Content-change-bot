import React from "react";

export default function Header({ activeTab, setActiveTab, status, onOpenLogin, onRefresh, onLogoutUser, onDisconnectTelegram }) {
  const isAuthorized = status?.authorized;
  const isSessionExpired = status?.session_expired;
  const tgUser = status?.user;
  const userEmail = status?.account?.email || "";
  const planName = status?.subscription?.plan_name || "Free Tier";

  const tabTitles = {
    "tab-studio": { title: "Side-by-Side Sync Studio", sub: "Source Extract → Modifier Engine → Destination Relay" },
    "tab-overview": { title: "Dashboard Overview & Stats", sub: "Real-time Telegram listener & n8n webhook automation" },
    "tab-channels": { title: "Dialogs & Channels Matrix", sub: "Inspect and manage accessible Telegram channels" },
    "tab-pricing": { title: "Pricing & Subscription Plans", sub: "Select a plan to enable real-time Telegram channel syncing" }
  };

  const currentHeader = tabTitles[activeTab] || tabTitles["tab-studio"];

  return (
    <header className="top-header" style={{ marginBottom: "14px", paddingBottom: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
      <div className="header-title" style={{ flexShrink: 1, minWidth: 0 }}>
        <h1 style={{ fontSize: "18px", fontWeight: "700", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {currentHeader.title}
        </h1>
        <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "2px 0 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {currentHeader.sub}
        </p>
      </div>

      <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        {/* User Account & Plan Badge */}
        {userEmail && (
          <div
            onClick={() => setActiveTab("tab-pricing")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(30, 41, 59, 0.8)",
              border: "1px solid var(--border-color)",
              padding: "5px 10px",
              borderRadius: "8px",
              fontSize: "11px",
              fontWeight: "500",
              cursor: "pointer"
            }}
            title="Account & Plan"
          >
            <i className="fa-solid fa-circle-user" style={{ color: "#3b82f6" }}></i>
            <span style={{ color: "#e2e8f0" }}>{userEmail}</span>
            <span style={{ color: "rgba(255, 255, 255, 0.2)" }}>|</span>
            <span style={{ color: "#fcd535", fontWeight: "600" }}>
              <i className="fa-solid fa-crown" style={{ fontSize: "10px", marginRight: "3px" }}></i>
              {planName}
            </span>
          </div>
        )}

        {/* Telegram Status Badge */}
        {isAuthorized && status?.connected ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "5px 10px", borderRadius: "8px", fontSize: "11px" }}>
            <span style={{ color: "var(--accent-green)", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px" }}>
              <i className="fa-solid fa-wifi" style={{ fontSize: "10px" }}></i>
              {tgUser?.first_name ? `TG: ${tgUser.first_name}` : "Connected"}
            </span>
            <button
              onClick={onDisconnectTelegram}
              title="Disconnect Telegram"
              style={{
                background: "transparent",
                border: "none",
                color: "#ef4444",
                cursor: "pointer",
                padding: "2px 4px",
                borderRadius: "4px",
                lineHeight: 1
              }}
            >
              <i className="fa-solid fa-xmark" style={{ fontSize: "11px" }}></i>
            </button>
          </div>
        ) : status?.status_code === "RECONNECTING" || status?.status_code === "DISCONNECTED_TEMPORARILY" ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.3)", padding: "5px 10px", borderRadius: "8px", fontSize: "11px" }}>
            <span style={{ color: "#f59e0b", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px" }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "10px" }}></i>
              {status.status_code === "RECONNECTING" ? "Reconnecting..." : "Temporarily Offline"}
            </span>
          </div>
        ) : isSessionExpired ? (
          <button
            className="btn btn-warning btn-sm"
            style={{ padding: "5px 10px", fontSize: "11px" }}
            onClick={onOpenLogin}
          >
            <i className="fa-solid fa-triangle-exclamation"></i> Reconnect TG
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" style={{ padding: "5px 10px", fontSize: "11px" }} onClick={onOpenLogin}>
            <i className="fa-paper-plane fa-solid"></i> Connect TG
          </button>
        )}

        <button className="btn btn-secondary btn-sm" style={{ padding: "5px 9px", fontSize: "11px" }} onClick={onRefresh} title="Refresh Feeds">
          <i className="fa-solid fa-arrows-rotate"></i>
        </button>

        <button className="btn btn-danger btn-sm" style={{ padding: "5px 9px", fontSize: "11px" }} onClick={onLogoutUser} title="Logout Account">
          <i className="fa-solid fa-right-from-bracket"></i>
        </button>
      </div>
    </header>
  );
}
