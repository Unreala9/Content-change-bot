import React, { useState, useEffect, useRef } from "react";

const formatLocalDate = (dateStr) => {
  if (!dateStr) return "";
  try {
    let raw = String(dateStr).trim();
    if (!raw.endsWith("Z") && !raw.includes("+") && !raw.includes("T")) {
      raw = raw.replace(" ", "T") + "Z";
    }
    const dateObj = new Date(raw);
    if (isNaN(dateObj.getTime())) return dateStr;

    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const seconds = String(dateObj.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return dateStr;
  }
};

const cleanDisplayMessage = (msgText) => {
  if (!msgText) return "";
  if (String(msgText).startsWith("↪ Replying to")) {
    const parts = String(msgText).split("\n\n");
    if (parts.length > 1) {
      return parts.slice(1).join("\n\n").trim();
    }
    return "";
  }
  return msgText;
};

export default function StudioTab({
  status,
  channels,
  sourceMessages = [],
  destinationMessages = [],
  onSaveRules,
  onFetchSourceMessages,
  onFetchDestinationMessages,
  onOpenLogin,
  onRefresh
}) {
  const isAuthorized = status?.authorized;
  const settings = status?.settings || {};

  const [autoPostTg, setAutoPostTg] = useState(settings.auto_post_telegram ?? true);
  const [autoPostN8n, setAutoPostN8n] = useState(settings.auto_post_n8n ?? true);
  const [webhookUrl, setWebhookUrl] = useState(settings.webhook_url || "https://n8n.getaipilot.in/webhook/telegram_sync");
  const [prefix, setPrefix] = useState(settings.text_prefix ?? "");
  const [suffix, setSuffix] = useState(settings.text_suffix ?? "");
  const [findText, setFindText] = useState(settings.find_text || "");
  const [replaceText, setReplaceText] = useState(settings.replace_text || "");
  const [overrideLinks, setOverrideLinks] = useState(settings.override_all_links ?? false);
  const [customUrl, setCustomUrl] = useState(settings.custom_link_url || "");
  const [removeLinks, setRemoveLinks] = useState(settings.remove_all_links ?? false);

  const [overrideImage, setOverrideImage] = useState(settings.override_media_image ?? false);
  const [customImageUrl, setCustomImageUrl] = useState(settings.custom_image_url || "");
  const [stripMedia, setStripMedia] = useState(settings.strip_media_images ?? false);

  const [filterMode, setFilterMode] = useState(settings.filter_mode || "all");
  const [keywordFilter, setKeywordFilter] = useState(settings.keyword_filter || "");

  const [sourceChannel, setSourceChannel] = useState(settings.source_channel_id || "all");
  const [destChannel, setDestChannel] = useState(settings.destination_channel_id || "");

  const sourceRef = useRef(sourceChannel);
  const destRef = useRef(destChannel);

  useEffect(() => { sourceRef.current = sourceChannel; }, [sourceChannel]);
  useEffect(() => { destRef.current = destChannel; }, [destChannel]);

  const channelHydratedRef = useRef(false);
  const rulesHydratedRef = useRef(false);

  useEffect(() => {
    if (status?.settings) {
      if (!channelHydratedRef.current) {
        if (status.settings.source_channel_id) {
          setSourceChannel(status.settings.source_channel_id);
          sourceRef.current = status.settings.source_channel_id;
        }
        if (status.settings.destination_channel_id) {
          setDestChannel(status.settings.destination_channel_id);
          destRef.current = status.settings.destination_channel_id;
        }
        channelHydratedRef.current = true;
      }

      if (!rulesHydratedRef.current) {
        if (status.settings.auto_post_telegram !== undefined) {
          setAutoPostTg(status.settings.auto_post_telegram);
        }
        if (status.settings.auto_post_n8n !== undefined) {
          setAutoPostN8n(status.settings.auto_post_n8n);
        }
        if (status.settings.webhook_url) setWebhookUrl(status.settings.webhook_url);
        if (status.settings.text_prefix !== undefined) setPrefix(status.settings.text_prefix);
        if (status.settings.text_suffix !== undefined) setSuffix(status.settings.text_suffix);
        if (status.settings.find_text !== undefined) setFindText(status.settings.find_text);
        if (status.settings.replace_text !== undefined) setReplaceText(status.settings.replace_text);
        if (status.settings.override_all_links !== undefined) setOverrideLinks(status.settings.override_all_links);
        if (status.settings.custom_link_url !== undefined) setCustomUrl(status.settings.custom_link_url);
        if (status.settings.remove_all_links !== undefined) setRemoveLinks(status.settings.remove_all_links);
        if (status.settings.override_media_image !== undefined) setOverrideImage(status.settings.override_media_image);
        if (status.settings.custom_image_url !== undefined) setCustomImageUrl(status.settings.custom_image_url);
        if (status.settings.strip_media_images !== undefined) setStripMedia(status.settings.strip_media_images);
        if (status.settings.filter_mode !== undefined) setFilterMode(status.settings.filter_mode);
        if (status.settings.keyword_filter !== undefined) setKeywordFilter(status.settings.keyword_filter);

        if (Array.isArray(status.settings.replacement_rules) && status.settings.replacement_rules.length > 0) {
          setIndividualRules(status.settings.replacement_rules.map((r, idx) => ({
            id: r.id || idx + 1,
            find: r.find || "",
            replace: r.replace || ""
          })));
        }
        rulesHydratedRef.current = true;
      }
    }
  }, [status?.settings]);

  useEffect(() => {
    console.log("[SOURCE RENDER]", {
      selectedSource: sourceChannel,
      count: sourceMessages.length,
      firstMessageChannel: sourceMessages[0]?.chat_id
    });
  }, [sourceChannel, sourceMessages]);

  useEffect(() => {
    console.log("[DEST RENDER]", {
      selectedDestination: destChannel,
      count: destinationMessages.length,
      firstMessageChannel: destinationMessages[0]?.chat_id
    });
  }, [destChannel, destinationMessages]);

  useEffect(() => {
    if (onFetchSourceMessages && sourceChannel) {
      onFetchSourceMessages(sourceChannel);
    }
  }, [sourceChannel]);

  useEffect(() => {
    if (onFetchDestinationMessages && destChannel) {
      onFetchDestinationMessages(destChannel);
    }
  }, [destChannel]);

  const [individualRules, setIndividualRules] = useState([
    { id: 1, find: "", replace: "" }
  ]);

  const handleAddRule = () => {
    console.info("[STUDIO] Adding new rule input row...");
    setIndividualRules(prev => [...prev, { id: Date.now(), find: "", replace: "" }]);
  };

  const handleRemoveRule = (id) => {
    setIndividualRules(prev => prev.filter(r => r.id !== id));
  };

  const handleRuleChange = (id, field, val) => {
    setIndividualRules(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  };

  const [showSavedToast, setShowSavedToast] = useState(false);

  const handleSave = () => {
    const validRules = individualRules.filter(r => r.find && r.find.trim() !== "");
    rulesHydratedRef.current = false;
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
    onSaveRules({
      webhook_url: webhookUrl,
      source_channel_id: sourceChannel,
      destination_channel_id: destChannel,
      auto_post_telegram: autoPostTg,
      auto_post_n8n: autoPostN8n,
      text_prefix: prefix,
      text_suffix: suffix,
      find_text: findText,
      replace_text: replaceText,
      replacement_rules: validRules,
      override_all_links: overrideLinks,
      custom_link_url: customUrl,
      remove_all_links: removeLinks,
      override_media_image: overrideImage,
      custom_image_url: customImageUrl,
      strip_media_images: stripMedia,
      keyword_filter: keywordFilter,
      filter_mode: filterMode,
      enabled: true
    });
  };

  const isChannelMatch = (idA, idB) => {
    if (!idA || !idB) return false;
    if (String(idA) === String(idB)) return true;
    const cleanA = String(idA).replace("-100", "").replace("-", "").trim();
    const cleanB = String(idB).replace("-100", "").replace("-", "").trim();
    return cleanA === cleanB;
  };

  const selectedSource = channels.find(c => isChannelMatch(c.id, sourceChannel));
  const selectedDest = channels.find(c => isChannelMatch(c.id, destChannel));

  const effectiveSourceValue = selectedSource ? selectedSource.id : sourceChannel;
  const effectiveDestValue = selectedDest ? selectedDest.id : destChannel;

  const formatChannelBadge = (chId) => {
    if (!chId || chId === "all") return "Global Extract";
    const str = String(chId).trim();
    return str.startsWith("-") ? str : `-${str}`;
  };

  return (
    <section className="tab-content active" id="tab-studio">
      {/* Top Channel Connector Bar */}
      <div
        style={{
          background: "rgba(13, 18, 31, 0.9)",
          border: "1px solid var(--border-color)",
          borderRadius: "14px",
          padding: "14px 20px",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: "16px",
          gap: "16px",
          backdropFilter: "blur(10px)"
        }}
      >
        {/* Source Channel Select */}
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
            <i className="fa-solid fa-square-poll-vertical text-blue"></i> Source Channel (Extract From)
          </label>
          <select
            className="form-select"
            style={{ width: "100%", height: "38px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid var(--border-color)", fontWeight: "600", fontSize: "13px" }}
            value={effectiveSourceValue}
            onChange={(e) => {
              const val = e.target.value;
              setSourceChannel(val);
              console.info("[STUDIO DEBUG] Selected source channel changed to:", val);
              if (onFetchMessages) onFetchMessages(val);
              if (onSaveRules) {
                onSaveRules({
                  source_channel_id: val,
                  destination_channel_id: destChannel,
                  auto_post_telegram: autoPostTg,
                  auto_post_n8n: autoPostN8n,
                  webhook_url: webhookUrl
                });
              }
            }}
          >
            <option value="all">⚡ All Incoming Chats (Global Extract)</option>
            {effectiveSourceValue && effectiveSourceValue !== "all" && !channels.some((ch) => isChannelMatch(ch.id, effectiveSourceValue)) && (
              <option value={effectiveSourceValue}>
                Selected Channel ({effectiveSourceValue})
              </option>
            )}
            {channels.map((ch, idx) => (
              <option key={`src-opt-${ch.id}-${idx}`} value={ch.id}>
                {ch.name} ({ch.type === "channel" ? "Channel" : ch.type})
              </option>
            ))}
          </select>
        </div>

        {/* Auto-Post Toggle */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
            <i className="fa-solid fa-bolt text-yellow"></i> Auto-Relay Pipeline
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(0, 0, 0, 0.4)", padding: "0 16px", height: "38px", borderRadius: "30px", border: "1px solid var(--border-color)" }}>
            <i className="fa-solid fa-arrow-right text-blue" style={{ fontSize: "14px" }}></i>
            <label className="switch" style={{ position: "relative", display: "inline-block", width: "40px", height: "22px", margin: 0 }}>
              <input
                type="checkbox"
                checked={autoPostTg}
                onChange={(e) => {
                  const val = e.target.checked;
                  setAutoPostTg(val);
                  console.info("[STUDIO DEBUG] Auto-post toggled to:", val);
                  if (onSaveRules) {
                    onSaveRules({
                      source_channel_id: sourceChannel,
                      destination_channel_id: destChannel,
                      auto_post_telegram: val,
                      auto_post_n8n: autoPostN8n,
                      webhook_url: webhookUrl
                    });
                  }
                }}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: "absolute",
                  cursor: "pointer",
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: autoPostTg ? "var(--primary-blue)" : "#374151",
                  transition: ".3s",
                  borderRadius: "22px"
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    content: '""',
                    height: "16px", width: "16px",
                    left: autoPostTg ? "20px" : "3px",
                    bottom: "3px",
                    backgroundColor: "white",
                    transition: ".3s",
                    borderRadius: "50%"
                  }}
                ></span>
              </span>
            </label>
            <span style={{ fontSize: "12px", fontWeight: "600", color: "#ffffff", whiteSpace: "nowrap" }}>Auto-Post to Destination</span>
          </div>
        </div>

        {/* Destination Channel Select */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
            <i className="fa-paper-plane fa-solid text-green"></i> Destination Channel (Paste To)
          </label>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <select
              className="form-select"
              style={{ width: "100%", height: "38px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid var(--border-color)", fontWeight: "600", fontSize: "13px" }}
              value={effectiveDestValue}
              onChange={(e) => {
                const val = e.target.value;
                setDestChannel(val);
                console.info("[STUDIO DEBUG] Selected destination channel changed to:", val);
                if (onSaveRules) {
                  onSaveRules({
                    source_channel_id: sourceChannel,
                    destination_channel_id: val,
                    auto_post_telegram: autoPostTg,
                    auto_post_n8n: autoPostN8n,
                    webhook_url: webhookUrl
                  });
                }
              }}
            >
              <option value="">-- Select Destination Channel --</option>
              {effectiveDestValue && !channels.some((ch) => isChannelMatch(ch.id, effectiveDestValue)) && (
                <option value={effectiveDestValue}>
                  Selected Destination ({effectiveDestValue})
                </option>
              )}
              {channels.map((ch, idx) => (
                <option key={`dest-opt-${ch.id}-${idx}`} value={ch.id}>
                  {ch.name} ({ch.type === "channel" ? "Channel" : ch.type})
                </option>
              ))}
            </select>
            <button className="btn btn-primary" style={{ padding: "0 14px", height: "38px", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} onClick={handleSave} title="Save & Link Channel">
              <i className="fa-paper-plane fa-solid"></i>
            </button>
          </div>
        </div>
      </div>

      {!isAuthorized && (
        <div
          className="banner-notice warning"
          style={{
            background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(13, 18, 31, 0.95) 100%)",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            borderRadius: "12px",
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
            gap: "16px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
            <i className="fa-solid fa-triangle-exclamation text-orange font-18" style={{ flexShrink: 0 }}></i>
            <span style={{ fontSize: "12px", lineHeight: "1.4" }}>
              {status?.session_expired ? (
                <>
                  <strong>
                    Session Key Revoked{status?.user?.first_name ? ` for ${status.user.first_name}` : ""}{status?.user?.phone ? ` (${status.user.phone})` : ""}:
                  </strong>{" "}
                  Re-enter 5-digit Telegram login code to issue a fresh active session key.
                </>
              ) : (
                <>
                  <strong>Telegram Account Not Connected:</strong> Connect your Telegram account to fetch accessible channels, extract live messages, and enable automated posting.
                </>
              )}
            </span>
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ whiteSpace: "nowrap", flexShrink: 0, padding: "8px 14px", fontSize: "12px" }}
            onClick={onOpenLogin}
          >
            <i className="fa-paper-plane fa-solid"></i> {status?.session_expired ? `Reconnect ${status?.user?.first_name || "Telegram"}` : "Connect Telegram Account"}
          </button>
        </div>
      )}

      {/* 3-Column Side-by-Side Studio Grid */}
      <div className="studio-grid-3cols">
        {/* Column 1: 1. Source Chat Stream */}
        <div className="studio-col card">
          <div className="studio-col-header" style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="col-title" style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "rgba(0, 136, 204, 0.2)",
                  color: "var(--primary-blue)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  border: "1px solid rgba(0, 136, 204, 0.4)",
                  flexShrink: 0
                }}
              >
                <i className="fa-solid fa-circle-arrow-down"></i>
              </div>
              <div style={{ overflow: "hidden" }}>
                <h3 style={{ fontSize: "14px", fontWeight: "700", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  1. Source Stream
                </h3>
                <span className="sub-text" style={{ color: "var(--primary-blue)", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                  {selectedSource ? selectedSource.name : (sourceChannel === "all" ? "All Incoming Chats" : "Not Selected")}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              <span
                className="badge"
                style={{
                  background: "rgba(0, 136, 204, 0.15)",
                  color: "var(--primary-blue)",
                  border: "1px solid rgba(0, 136, 204, 0.3)",
                  fontSize: "11px",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }}
              >
                {formatChannelBadge(sourceChannel)}
              </span>
              <button className="btn-logout-icon" onClick={onRefresh} title="Refresh Source Feed" style={{ flexShrink: 0 }}>
                <i className="fa-solid fa-arrows-rotate text-muted"></i>
              </button>
            </div>
          </div>

          <div className="studio-col-body" style={{ padding: "14px" }}>
            {!isAuthorized ? (
              <div className="empty-state" style={{ padding: "60px 20px" }}>
                <i className="fa-solid fa-paper-plane font-24 mb-10" style={{ fontSize: "32px", color: "var(--primary-blue)", display: "block", margin: "0 auto 12px" }}></i>
                <h4 style={{ color: "#ffffff", fontSize: "14px", fontWeight: "600", marginBottom: "4px" }}>Telegram Not Connected</h4>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>Connect your Telegram account to start extracting live chats.</p>
                <button className="btn btn-primary btn-sm" onClick={onOpenLogin}>
                  <i className="fa-paper-plane fa-solid"></i> Connect Telegram Account
                </button>
              </div>
            ) : sourceMessages.length === 0 ? (
              <div className="empty-state" style={{ padding: "60px 20px" }}>
                <i className="fa-solid fa-comments font-24 mb-10" style={{ fontSize: "32px", display: "block", margin: "0 auto 12px" }}></i>
                <p style={{ fontSize: "12px" }}>No messages received yet in source channel.</p>
              </div>
            ) : (
              <div className="stream-feed" style={{ maxHeight: "540px", overflowY: "auto", paddingRight: "4px" }}>
                {sourceMessages.map((m, idx) => (
                  <div
                    className="msg-card"
                    key={`src-msg-${m.chat_id || 'all'}-${m.id || idx}-${idx}`}
                    style={{
                      background: "rgba(13, 18, 31, 0.8)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "10px",
                      padding: "12px",
                      marginBottom: "10px"
                    }}
                  >
                    <div className="msg-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontWeight: "700", color: "#ffffff", fontSize: "12px" }}>
                        <i className="fa-regular fa-square"></i> {m.chat_name}
                      </span>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{formatLocalDate(m.date)}</span>
                    </div>

                    <div className="msg-body" style={{ fontSize: "13px", fontWeight: "600", color: "#ffffff", margin: "8px 0", lineHeight: "1.4" }}>
                      {m.is_reply && (
                        <div style={{
                          background: "rgba(56, 189, 248, 0.08)",
                          borderLeft: "3px solid #38bdf8",
                          borderRadius: "0 6px 6px 0",
                          padding: "5px 10px",
                          marginBottom: "8px",
                          fontSize: "12px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px"
                        }}>
                          <span style={{ fontWeight: "700", color: "#38bdf8", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}>
                            <i className="fa-solid fa-reply" style={{ fontSize: "9px" }}></i> {m.reply_sender || "Reply"}
                          </span>
                          <span style={{ color: "rgba(255, 255, 255, 0.75)", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                            {m.reply_text ? m.reply_text : `Replying to message #${m.reply_to_msg_id || ""}`}
                          </span>
                        </div>
                      )}
                      {m.raw_message}
                      {m.has_media && (
                        <div style={{ marginTop: "6px", display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: "6px", padding: "2px 8px", fontSize: "11px" }}>
                          <i className={m.media_type === "video" ? "fa-solid fa-video" : (m.media_type === "photo" ? "fa-solid fa-image" : "fa-solid fa-paperclip")}></i>
                          <span>{m.media_type ? m.media_type.toUpperCase() : "MEDIA ATTACHMENT"}</span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span className="badge" style={{ background: "rgba(0, 136, 204, 0.15)", color: "var(--primary-blue)", fontSize: "10px" }}>
                        ID: {m.id || 146695 + idx}
                      </span>
                      <button className="btn btn-outline btn-sm" style={{ fontSize: "10px", padding: "2px 6px" }}>
                        <i className="fa-solid fa-percent"></i> Load into Modifier
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Column 2: ⚙️ 2. Modifier Engine */}
        <div className="studio-col card">
          <div className="studio-col-header" style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="col-title" style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "rgba(139, 92, 246, 0.2)",
                  color: "var(--accent-purple)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  border: "1px solid rgba(139, 92, 246, 0.4)",
                  flexShrink: 0
                }}
              >
                <i className="fa-solid fa-wand-magic-sparkles"></i>
              </div>
              <div style={{ overflow: "hidden" }}>
                <h3 style={{ fontSize: "14px", fontWeight: "700", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  2. Modifier Engine
                </h3>
                <span className="sub-text" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                  Text & Link Rules
                </span>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleSave} style={{ background: "var(--primary-blue)", gap: "6px", whiteSpace: "nowrap", flexShrink: 0, padding: "6px 12px", fontSize: "12px" }}>
              <i className="fa-solid fa-floppy-disk"></i> Save Rules
            </button>
          </div>

          <div className="studio-col-body" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* n8n Webhook Target */}
            <div className="modifier-section" style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "12px" }}>
              <h4 style={{ fontSize: "12px", fontWeight: "600", color: "#ffffff", marginBottom: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
                <i className="fa-solid fa-globe text-orange"></i> n8n Webhook Target
              </h4>
              <input
                type="url"
                className="form-control"
                placeholder="https://n8n.getaipilot.in/webhook/telegram_sync"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>

            {/* 📝 Prefix & Suffix Customizer */}
            <div className="modifier-section" style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "12px" }}>
              <h4 style={{ fontSize: "12px", fontWeight: "600", color: "#ffffff", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                <i className="fa-solid fa-font text-blue"></i> Prefix & Suffix Customizer
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>Text Prefix</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="[MIRROR]"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>Text Suffix</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="#Sync"
                    value={suffix}
                    onChange={(e) => setSuffix(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* 🔍 Find & Replace Rules */}
            <div className="modifier-section" style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <h4 style={{ fontSize: "12px", fontWeight: "600", color: "#ffffff", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                  <i className="fa-solid fa-pen-to-square text-purple"></i> Multiple Find & Replace Rules
                </h4>
                <button className="btn btn-outline btn-sm" onClick={handleAddRule} style={{ fontSize: "10px", padding: "2px 6px" }}>
                  + Add Rule
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {individualRules.map((rule) => (
                  <div key={rule.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 28px", gap: "6px", alignItems: "center" }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Find text..."
                      value={rule.find}
                      onChange={(e) => handleRuleChange(rule.id, "find", e.target.value)}
                    />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Replace with..."
                      value={rule.replace}
                      onChange={(e) => handleRuleChange(rule.id, "replace", e.target.value)}
                    />
                    <button
                      className="btn-logout-icon"
                      onClick={() => handleRemoveRule(rule.id)}
                      style={{ color: "#ef4444", padding: "4px" }}
                      title="Remove Rule"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* ⚡ Bulk Replacement (Quick Mode) */}
            <div className="modifier-section" style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "12px" }}>
              <h4 style={{ fontSize: "12px", fontWeight: "600", color: "#ffffff", marginBottom: "2px", display: "flex", alignItems: "center", gap: "8px" }}>
                <i className="fa-solid fa-bolt text-yellow"></i> Bulk Replacement (Quick Mode):
              </h4>
              <p style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "8px" }}>Comma-separated target words matched 1-to-1</p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="crypto, urgent, Loot"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                />
                <input
                  type="text"
                  className="form-control"
                  placeholder="web3, now, Deal"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                />
              </div>
            </div>

            {/* 🔗 Smart Universal Link Replacement */}
            <div className="modifier-section" style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "12px" }}>
              <h4 style={{ fontSize: "12px", fontWeight: "600", color: "#ffffff", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                <i className="fa-solid fa-link text-blue"></i> Smart Universal Link Replacement
              </h4>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", marginBottom: "6px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={removeLinks}
                  onChange={(e) => setRemoveLinks(e.target.checked)}
                />
                Remove all links from message text
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", marginBottom: "6px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={overrideLinks}
                  onChange={(e) => setOverrideLinks(e.target.checked)}
                />
                Replace all links with custom URL
              </label>
              <input
                type="url"
                className="form-control"
                placeholder="https://t.me/your_promotional_channel"
                disabled={!overrideLinks}
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
              />
            </div>

            {/* 🖼️ Smart Media & Custom Image Replacement */}
            <div className="modifier-section" style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "12px" }}>
              <h4 style={{ fontSize: "12px", fontWeight: "600", color: "#ffffff", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                <i className="fa-solid fa-image text-green"></i> Smart Media & Custom Image Replacement
              </h4>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", marginBottom: "6px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={overrideImage}
                  onChange={(e) => setOverrideImage(e.target.checked)}
                />
                Replace original message image with custom Image URL
              </label>

              <input
                type="url"
                className="form-control"
                placeholder="https://example.com/your-custom-banner.jpg"
                disabled={!overrideImage}
                value={customImageUrl}
                onChange={(e) => setCustomImageUrl(e.target.value)}
              />

              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", marginTop: "10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={stripMedia}
                  onChange={(e) => setStripMedia(e.target.checked)}
                />
                Strip media & send text-only messages
              </label>
            </div>
          </div>
        </div>

        {/* Column 3: 📤 3. Destination Chat Stream */}
        <div className="studio-col card">
          <div className="studio-col-header" style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="col-title" style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "rgba(16, 185, 129, 0.2)",
                  color: "var(--accent-green)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  border: "1px solid rgba(16, 185, 129, 0.4)",
                  flexShrink: 0
                }}
              >
                <i className="fa-solid fa-circle-arrow-up"></i>
              </div>
              <div style={{ overflow: "hidden" }}>
                <h3 style={{ fontSize: "14px", fontWeight: "700", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  3. Destination Stream
                </h3>
                <span className="sub-text" style={{ color: "var(--accent-green)", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                  {selectedDest ? selectedDest.name : "Select Target Channel"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              <span
                className="badge"
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "var(--accent-green)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  fontSize: "11px",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }}
              >
                {destChannel ? formatChannelBadge(destChannel) : "Target Chat"}
              </span>
              <button className="btn-logout-icon" onClick={onRefresh} title="Refresh Destination Feed" style={{ flexShrink: 0 }}>
                <i className="fa-solid fa-arrows-rotate text-muted"></i>
              </button>
            </div>
          </div>

          <div className="studio-col-body" style={{ padding: "14px" }}>
            {!isAuthorized ? (
              <div className="empty-state" style={{ padding: "60px 20px" }}>
                <i className="fa-solid fa-paper-plane font-24 mb-10" style={{ fontSize: "32px", color: "var(--accent-green)", display: "block", margin: "0 auto 12px" }}></i>
                <h4 style={{ color: "#ffffff", fontSize: "14px", fontWeight: "600", marginBottom: "4px" }}>Telegram Not Connected</h4>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>Connect your Telegram account to enable live destination posting.</p>
                <button className="btn btn-primary btn-sm" onClick={onOpenLogin}>
                  <i className="fa-paper-plane fa-solid"></i> Connect Telegram Account
                </button>
              </div>
            ) : destinationMessages.length === 0 ? (
              <div className="empty-state" style={{ padding: "60px 20px" }}>
                <i className="fa-solid fa-paper-plane font-24 mb-10" style={{ fontSize: "32px", color: "var(--accent-green)", display: "block", margin: "0 auto 12px" }}></i>
                <p style={{ fontSize: "12px" }}>
                  {destChannel ? `No forwarded messages recorded yet for ${selectedDest ? selectedDest.name : destChannel}.` : "Select destination channel to view target chat feed..."}
                </p>
              </div>
            ) : (
              <div className="stream-feed" style={{ maxHeight: "540px", overflowY: "auto", paddingRight: "4px" }}>
                {destinationMessages.map((m, idx) => (
                  <div
                    className="msg-card"
                    key={`dest-msg-${m.chat_id || 'dest'}-${m.id || idx}-${idx}`}
                    style={{
                      background: "rgba(13, 18, 31, 0.8)",
                      border: "1px solid var(--border-color)",
                      borderLeft: "3px solid var(--accent-green)",
                      borderRadius: "10px",
                      padding: "12px",
                      marginBottom: "10px"
                    }}
                  >
                    <div className="msg-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <strong style={{ color: "var(--accent-green)", fontSize: "12px" }}>
                        <i className="fa-solid fa-circle-check"></i> {selectedDest ? selectedDest.name : "Destination Feed"}
                      </strong>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{formatLocalDate(m.date)}</span>
                    </div>

                    <div className="msg-body" style={{ fontSize: "13px", fontWeight: "600", color: "#ffffff", margin: "8px 0", lineHeight: "1.4" }}>
                      {m.is_reply && (
                        <div style={{
                          background: "rgba(16, 185, 129, 0.08)",
                          borderLeft: "3px solid var(--accent-green)",
                          borderRadius: "0 6px 6px 0",
                          padding: "5px 10px",
                          marginBottom: "8px",
                          fontSize: "12px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px"
                        }}>
                          <span style={{ fontWeight: "700", color: "var(--accent-green)", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}>
                            <i className="fa-solid fa-reply" style={{ fontSize: "9px" }}></i> {m.reply_sender || "Reply"}
                          </span>
                          <span style={{ color: "rgba(255, 255, 255, 0.75)", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                            {m.reply_text ? m.reply_text : `Replying to message #${m.reply_to_msg_id || ""}`}
                          </span>
                        </div>
                      )}
                      {cleanDisplayMessage(m.transformed_message || m.raw_message) || (
                        <span style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: "12px" }}>
                          (Media Attachment Forwarded)
                        </span>
                      )}
                      {(m.has_media || m.media_type) && (
                        <div style={{ marginTop: "6px", display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(16, 185, 129, 0.15)", color: "var(--accent-green)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "6px", padding: "2px 8px", fontSize: "11px" }}>
                          <i className={m.media_type === "video" ? "fa-solid fa-video" : (m.media_type === "photo" ? "fa-solid fa-image" : "fa-solid fa-paperclip")}></i>
                          <span>{m.media_type ? m.media_type.toUpperCase() : "MEDIA ATTACHMENT"}</span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-start", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "var(--accent-green)", border: "1px solid rgba(16, 185, 129, 0.3)", fontSize: "10px" }}>
                        ID: {m.id || idx + 1}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
