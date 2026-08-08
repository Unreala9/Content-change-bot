import React, { useState } from "react";

export default function ChannelsTab({ channels, onFetchChannels, status, onOpenLogin }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReload = async () => {
    setLoading(true);
    try {
      if (onFetchChannels) await onFetchChannels();
    } finally {
      setLoading(false);
    }
  };

  const isAuthorized = status?.authorized;

  let filtered = channels || [];
  if (filter !== "all") {
    filtered = filtered.filter(c => c.type.toLowerCase() === filter);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(c => (c.name || "").toLowerCase().includes(q) || String(c.id).includes(q));
  }

  return (
    <section className="tab-content active" id="tab-channels">
      <div className="card">
        <div className="card-header">
          <div>
            <h3><i className="fa-solid fa-comments"></i> Dialogs & Channels Management</h3>
            <p className="text-muted" style={{ fontSize: "12px" }}>Search, inspect and target Telegram channels, groups, or direct chats</p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              type="text"
              className="form-control"
              style={{ width: "240px" }}
              placeholder="Search chats by title or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" onClick={handleReload} disabled={loading}>
              <i className={`fa-solid ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`}></i> Reload Dialogs
            </button>
          </div>
        </div>

        <div className="card-body">
          <div className="filter-pills">
            <button className={`filter-pill ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All Dialogs</button>
            <button className={`filter-pill ${filter === "channel" ? "active" : ""}`} onClick={() => setFilter("channel")}>Channels Only</button>
            <button className={`filter-pill ${filter === "group" ? "active" : ""}`} onClick={() => setFilter("group")}>Groups Only</button>
            <button className={`filter-pill ${filter === "user" ? "active" : ""}`} onClick={() => setFilter("user")}>Private Users</button>
          </div>

          {!isAuthorized ? (
            <div className="empty-state" style={{ padding: "40px 20px", textAlign: "center" }}>
              <i className="fa-solid fa-plug-circle-xmark font-24 mb-10" style={{ color: "#ef4444", fontSize: "36px" }}></i>
              <h4 style={{ color: "#ffffff", marginTop: "10px" }}>Telegram Account Not Connected</h4>
              <p className="text-muted" style={{ fontSize: "13px", margin: "8px 0 16px 0" }}>
                Connect your Telegram account to load and manage your channels, groups, and chats.
              </p>
              <button className="btn btn-primary btn-sm" onClick={onOpenLogin}>
                <i className="fa-solid fa-paper-plane"></i> Connect Telegram Account
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px", marginTop: "16px" }}>
              {filtered.length === 0 ? (
                <div className="empty-state" style={{ gridColumn: "1 / -1", padding: "40px 20px", textAlign: "center" }}>
                  <i className="fa-solid fa-comments font-24 mb-10" style={{ fontSize: "32px", color: "var(--text-muted)" }}></i>
                  <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                    {search ? `No Telegram dialogs found matching "${search}".` : "No Telegram dialogs found for your account."}
                  </p>
                  <button className="btn btn-outline btn-sm" style={{ marginTop: "12px" }} onClick={handleReload} disabled={loading}>
                    <i className={`fa-solid ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`}></i> Refresh Chats
                  </button>
                </div>
              ) : (
                filtered.map((chat, idx) => (
                  <div
                    key={`ch-card-${chat.id}-${idx}`}
                    style={{
                      background: "rgba(0, 0, 0, 0.3)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "12px",
                      padding: "16px",
                      display: "flex",
                      alignItems: "center",
                      gap: "14px"
                    }}
                  >
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "10px",
                        background: "rgba(0, 136, 204, 0.15)",
                        color: "var(--primary-blue)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "18px",
                        border: "1px solid rgba(0, 136, 204, 0.3)",
                        flexShrink: 0
                      }}
                    >
                      <i className={`fa-solid ${chat.type === "group" ? "fa-users" : chat.type === "user" ? "fa-user" : "fa-bullhorn"}`}></i>
                    </div>
                    <div style={{ overflow: "hidden" }}>
                      <h4 style={{ fontSize: "14px", fontWeight: "600", color: "#ffffff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {chat.name}
                      </h4>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>
                        ID: {chat.id} | Type: {chat.type}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
