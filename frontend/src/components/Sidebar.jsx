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

      <div className="sidebar-footer" style={{ padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(13, 18, 31, 0.7)", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className={`status-indicator ${isAuthorized ? "online" : (isSessionExpired ? "warning" : "offline")}`}></span>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#ffffff" }}>
              {isAuthorized ? (firstName ? `TG: ${firstName}` : "TG Connected") : "TG Disconnected"}
            </span>
          </div>
          <span
            onClick={() => setActiveTab("tab-pricing")}
            style={{ fontSize: "10px", color: "#fcd535", background: "rgba(252, 213, 53, 0.15)", padding: "2px 6px", borderRadius: "4px", fontWeight: "600", cursor: "pointer" }}
            title="Current Plan"
          >
            👑 {status?.subscription?.plan_name || "Free"}
          </span>
        </div>
      </div>
    </aside>
  );
}
