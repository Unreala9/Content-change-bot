import React, { useState } from "react";

export default function RulesTab({ status, onSaveRules }) {
  const settings = status?.settings || {};

  const [webhookUrl, setWebhookUrl] = useState(settings.webhook_url || "https://n8n.getaipilot.in/webhook/telegram_sync");
  const [prefix, setPrefix] = useState(settings.text_prefix || "");
  const [suffix, setSuffix] = useState(settings.text_suffix || "");
  const [findText, setFindText] = useState(settings.find_text || "");
  const [replaceText, setReplaceText] = useState(settings.replace_text || "");
  const [overrideLinks, setOverrideLinks] = useState(settings.override_all_links ?? false);
  const [customUrl, setCustomUrl] = useState(settings.custom_link_url || "");
  const [removeLinks, setRemoveLinks] = useState(settings.remove_all_links ?? false);
  const [filterMode, setFilterMode] = useState(settings.filter_mode || "all");
  const [keywordFilter, setKeywordFilter] = useState(settings.keyword_filter || "");

  const handleSave = (e) => {
    e.preventDefault();
    onSaveRules({
      webhook_url: webhookUrl,
      text_prefix: prefix,
      text_suffix: suffix,
      find_text: findText,
      replace_text: replaceText,
      override_all_links: overrideLinks,
      custom_link_url: customUrl,
      remove_all_links: removeLinks,
      keyword_filter: keywordFilter,
      filter_mode: filterMode,
      enabled: true
    });
  };

  return (
    <section className="tab-content active" id="tab-rules">
      <div className="card">
        <div className="card-header">
          <h3><i className="fa-solid fa-sliders"></i> Sync Engine & Rules Setup</h3>
        </div>

        <div className="card-body">
          <form onSubmit={handleSave}>
            <div className="form-group mb-20" style={{ marginBottom: "20px" }}>
              <label style={{ fontWeight: 600, display: "block", marginBottom: "6px" }}>n8n Webhook Target URL</label>
              <input
                type="url"
                className="form-control"
                placeholder="https://n8n.yourdomain.com/webhook/telegram_sync"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>

            <div className="grid-2col mb-20" style={{ marginBottom: "20px" }}>
              <div>
                <label style={{ fontWeight: 600, display: "block", marginBottom: "6px" }}>Global Text Prefix</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="[MIRROR]"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, display: "block", marginBottom: "6px" }}>Global Text Suffix</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="#Sync"
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                />
              </div>
            </div>

            <div className="grid-2col mb-20" style={{ marginBottom: "20px" }}>
              <div>
                <label style={{ fontWeight: 600, display: "block", marginBottom: "6px" }}>Quick Replace Target (Comma-separated)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="crypto, loot"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, display: "block", marginBottom: "6px" }}>Quick Replacement Text</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="web3, deal"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-100" style={{ width: "100%", padding: "12px" }}>
              <i className="fa-solid fa-floppy-disk"></i> Save & Apply All Engine Settings
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
