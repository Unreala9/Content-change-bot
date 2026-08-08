import React from "react";

export default function Sidebar({ activeTab, setActiveTab, status, onLogoutUser }) {
  const isAuthorized = status?.authorized;
  const isSessionExpired = status?.session_expired;
  const tgUser = status?.user;

  const firstName = tgUser?.first_name || "";
  const username = tgUser?.username ? `@${tgUser.username}` : "";
  const phone = tgUser?.phone || "";

  return (
    <aside className="sidebar">
      <div className="logo-container">
        <div className="logo-icon">
          <i className="fa-paper-plane fa-telegram-blue"></i>
        </div>
        <div className="logo-text">
          <h2>Telegram<span>Sync</span></h2>
          <span className="version-tag">Studio v2.5</span>
        </div>
      </div>

      <nav className="nav-menu">
        <button
          className={`nav-btn ${activeTab === "tab-studio" ? "active" : ""}`}
          onClick={() => setActiveTab("tab-studio")}
        >
          <i className="fa-solid fa-table-columns"></i>
          <span>Side-by-Side Studio</span>
        </button>

        <button
          className={`nav-btn ${activeTab === "tab-overview" ? "active" : ""}`}
          onClick={() => setActiveTab("tab-overview")}
        >
          <i className="fa-solid fa-chart-pie"></i>
          <span>Overview & Stats</span>
        </button>

        <button
          className={`nav-btn ${activeTab === "tab-channels" ? "active" : ""}`}
          onClick={() => setActiveTab("tab-channels")}
        >
          <i className="fa-solid fa-comments"></i>
          <span>Channels & Chats</span>
        </button>



        <button
          className={`nav-btn ${activeTab === "tab-pricing" ? "active" : ""}`}
          onClick={() => setActiveTab("tab-pricing")}
        >
          <i className="fa-solid fa-crown"></i>
          <span>Pricing & Plans</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className="account-badge" style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className={`status-indicator ${isAuthorized ? "online" : (isSessionExpired ? "warning" : "offline")}`}></span>
            <div className="account-info">
              <span className="account-title" style={{ fontWeight: "700" }}>
                {isAuthorized
                  ? (firstName ? `Connected: ${firstName}` : "Telegram Connected")
                  : (isSessionExpired ? `Session Expired (${firstName || phone})` : "Disconnected / Not Signed In")}
              </span>
              <span className="account-sub" style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>
                {username || phone || (isSessionExpired ? "Action required: Re-auth" : "Action required")}
              </span>
            </div>
          </div>

          <div
            onClick={() => setActiveTab("tab-pricing")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11px",
              fontWeight: "600",
              color: "#fcd535",
              background: "rgba(252, 213, 53, 0.12)",
              padding: "4px 8px",
              borderRadius: "6px",
              cursor: "pointer",
              border: "1px solid rgba(252, 213, 53, 0.25)",
              width: "100%",
              marginTop: "4px"
            }}
            title="Click to view subscription plans"
          >
            <i className="fa-solid fa-crown" style={{ color: "#ffd700" }}></i>
            <span>Plan: {status?.subscription?.plan_name || "Free Tier"}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
