import React from "react";

export default function FeedTab({ messages }) {
  return (
    <section className="tab-content active" id="tab-feed">
      <div className="card">
        <div className="card-header">
          <h3><i className="fa-solid fa-list-check"></i> Full Real-Time Message Intercept Feed</h3>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source Chat</th>
                  <th>Chat ID</th>
                  <th>Raw Intercepted Text</th>
                  <th>Transformed Output Text</th>
                  <th>Status & Target</th>
                </tr>
              </thead>
              <tbody>
                {messages.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", color: "var(--text-muted)", padding: "24px" }}>
                      No logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  messages.map((m, idx) => (
                    <tr key={`feed-msg-${m.id || idx}-${idx}`}>
                      <td style={{ fontSize: "11px", color: "var(--text-muted)" }}>{m.date}</td>
                      <td><strong>{m.chat_name}</strong></td>
                      <td><span className="badge badge-outline">{m.chat_id}</span></td>
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
