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
          className={`nav-btn ${activeTab === "tab-rules" ? "active" : ""}`}
          onClick={() => setActiveTab("tab-rules")}
        >
          <i className="fa-solid fa-bolt"></i>
          <span>n8n & Rules Engine</span>
        </button>

        <button
          className={`nav-btn ${activeTab === "tab-feed" ? "active" : ""}`}
          onClick={() => setActiveTab("tab-feed")}
        >
          <i className="fa-solid fa-list-check"></i>
          <span>Live Sync Feed</span>
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
        <div className="account-badge">
          <span className={`status-indicator ${isAuthorized ? "online" : (isSessionExpired ? "warning" : "offline")}`}></span>
          <div className="account-info">
            <span className="account-title" style={{ fontWeight: "700" }}>
              {isAuthorized
                ? (firstName ? `Connected: ${firstName}` : "Telegram Connected")
                : (isSessionExpired ? `Session Expired (${firstName || phone})` : "Disconnected / Not Signed In")}
            </span>
            <span className="account-sub" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {username || phone || (isSessionExpired ? "Action required: Re-auth" : "Action required")}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
