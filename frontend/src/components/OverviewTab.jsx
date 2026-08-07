import React from "react";

export default function OverviewTab({ status, messages, setActiveTab, onOpenLogin, onDisconnectTelegram }) {
  const stats = status?.stats || { received: 0, forwarded: 0, filtered: 0 };
  const sub = status?.subscription || { plan_name: "Free Tier", status: "active" };

  return (
    <section className="tab-content active" id="tab-overview">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue"><i className="fa-solid fa-inbox"></i></div>
          <div className="stat-details">
            <h3>{stats.received}</h3>
            <span>Messages Received</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green"><i className="fa-solid fa-paper-plane"></i></div>
          <div className="stat-details">
            <h3>{stats.forwarded}</h3>
            <span>Forwarded / Synced</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange"><i className="fa-solid fa-filter"></i></div>
          <div className="stat-details">
            <h3>{stats.filtered}</h3>
            <span>Filtered / Skipped</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple"><i className="fa-solid fa-network-wired"></i></div>
          <div className="stat-details">
            <h3>{status?.connected ? "Active" : "Standby"}</h3>
            <span>Sync Engine Status</span>
          </div>
        </div>

        <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => setActiveTab("tab-pricing")}>
          <div className="stat-icon" style={{ background: "rgba(252, 213, 53, 0.15)", color: "var(--primary-yellow)", border: "1px solid rgba(252, 213, 53, 0.3)" }}>
            <i className="fa-solid fa-crown"></i>
          </div>
          <div className="stat-details">
            <h3 style={{ color: "var(--primary-yellow)" }}>{sub.plan_name}</h3>
            <span>Click to manage plan</span>
          </div>
        </div>
      </div>

      <div className="grid-2col mt-20">
        <div className="card">
          <div className="card-header">
            <h3><i className="fa-solid fa-user-shield"></i> Telegram Account Login</h3>
            <span className={`badge ${status?.authorized ? "badge-success" : "badge-outline"}`}>
              {status?.authorized ? "Connected" : "Signed Out"}
            </span>
          </div>
          <div className="card-body text-center">
            {status?.authorized ? (
              <>
                <div className="avatar-box big mb-10"><i className="fa-solid fa-user-check text-success"></i></div>
                <h4>{status.user?.first_name || "Telegram Account"}</h4>
                <p className="text-muted font-12" style={{ marginTop: "4px" }}>
                  User ID: {status.user?.id} | Phone: {status.user?.phone}
                </p>
                <div style={{ marginTop: "16px" }}>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={onDisconnectTelegram}
                    style={{ borderRadius: "8px", gap: "6px", display: "inline-flex", alignItems: "center" }}
                  >
                    <i className="fa-solid fa-right-from-bracket"></i> Disconnect Telegram Account
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="avatar-box big mb-10"><i className="fa-solid fa-question"></i></div>
                <h4>Not Signed In</h4>
                <p className="text-muted">Click button below to connect Telegram</p>
                <button className="btn btn-primary mt-15" onClick={onOpenLogin}>
                  <i className="fa-solid fa-key"></i> Authenticate Account
                </button>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><i className="fa-solid fa-share-nodes"></i> Active n8n Webhook Target</h3>
          </div>
          <div className="card-body">
            <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>ENDPOINT URL:</span>
              <code style={{ fontSize: "13px", color: "var(--primary-blue)" }}>
                {status?.settings?.webhook_url || "Not Configured"}
              </code>
            </div>
            <p className="text-muted" style={{ fontSize: "12px", marginTop: "12px" }}>
              Incoming Telegram messages are transformed using your custom rules and forwarded to this n8n webhook URL automatically.
            </p>
            <button className="btn btn-outline btn-sm mt-10" onClick={() => setActiveTab("tab-rules")}>
              <i className="fa-solid fa-sliders"></i> Customize n8n Text Rules
            </button>
          </div>
        </div>
      </div>

      <div className="card mt-20">
        <div className="card-header">
          <h3><i className="fa-solid fa-clock-rotate-left"></i> Recent Activity Logs</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Source Chat</th>
                  <th>Raw Message</th>
                  <th>Transformed Output</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {messages.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: "center", color: "var(--text-muted)", padding: "24px" }}>
                      No intercept logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  messages.slice(0, 10).map((m, idx) => (
                    <tr key={`overview-msg-${m.id || idx}-${idx}`}>
                      <td style={{ fontSize: "11px", color: "var(--text-muted)" }}>{m.date}</td>
                      <td><strong>{m.chat_name}</strong></td>
                      <td><code>{m.raw_message}</code></td>
                      <td style={{ color: "var(--accent-green)" }}><code>{m.transformed_message}</code></td>
                      <td>
                        <span className={`badge ${m.status?.includes("sent") || m.status?.includes("synced") ? "badge-success" : "badge-warning"}`}>
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
