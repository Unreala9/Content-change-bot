/* ==========================================================================
   Telegram Sync & Side-by-Side Studio - JavaScript Application Logic
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // --- Global Application State ---
    let state = {
        connected: false,
        authorized: false,
        user: null,
        channels: [],
        activeChannelFilter: "all",
        searchQuery: "",
        settings: {},
        messages: [],
        sourceHistory: [],
        destHistory: [],
        replacementRules: [] // Array of {find: "", replace: ""}
    };

    // --- DOM Elements Cache ---
    const navButtons = document.querySelectorAll(".nav-btn");
    const tabContents = document.querySelectorAll(".tab-content");
    const pageTitle = document.getElementById("pageTitle");
    const pageSubtitle = document.getElementById("pageSubtitle");

    // Header & Sidebar Indicators
    const sidebarStatusDot = document.getElementById("sidebarStatusDot");
    const sidebarStatusTitle = document.getElementById("sidebarStatusTitle");
    const sidebarStatusUser = document.getElementById("sidebarStatusUser");
    const headerConnectionBadge = document.getElementById("headerConnectionBadge");
    const btnRefreshStatus = document.getElementById("btnRefreshStatus");

    // Studio Top Control Bar
    const selectSourceChannel = document.getElementById("selectSourceChannel");
    const selectDestChannel = document.getElementById("selectDestChannel");
    const switchAutoTelegram = document.getElementById("switchAutoTelegram");
    const btnQuickSend = document.getElementById("btnQuickSend");

    // Studio Panel Headers
    const sourceChannelSubtext = document.getElementById("sourceChannelSubtext");
    const sourceIdBadge = document.getElementById("sourceIdBadge");
    const sourceChatFeed = document.getElementById("sourceChatFeed");
    const btnRefreshSourceChat = document.getElementById("btnRefreshSourceChat");

    const destChannelSubtext = document.getElementById("destChannelSubtext");
    const destIdBadge = document.getElementById("destIdBadge");
    const destChatFeed = document.getElementById("destChatFeed");
    const btnRefreshDestChat = document.getElementById("btnRefreshDestChat");

    // Studio Modifier Controls
    const inputWebhookUrl = document.getElementById("inputWebhookUrl");
    const studioPrefix = document.getElementById("studioPrefix");
    const studioSuffix = document.getElementById("studioSuffix");
    const studioFind = document.getElementById("studioFind");
    const studioReplace = document.getElementById("studioReplace");
    const selectFilterMode = document.getElementById("selectFilterMode");
    const studioKeyword = document.getElementById("studioKeyword");
    const studioTransformedPreview = document.getElementById("studioTransformedPreview");
    const sandboxStatusBadge = document.getElementById("sandboxStatusBadge");
    const btnSaveStudioRules = document.getElementById("btnSaveStudioRules");

    // Multi-Rules & Link Modifier Elements
    const btnAddRuleRow = document.getElementById("btnAddRuleRow");
    const rulesRowsContainer = document.getElementById("rulesRowsContainer");
    const chkOverrideLinks = document.getElementById("chkOverrideLinks");
    const inputCustomLinkUrl = document.getElementById("inputCustomLinkUrl");
    const chkRemoveLinks = document.getElementById("chkRemoveLinks");

    // Overview & Channels Tab Elements
    const statReceived = document.getElementById("statReceived");
    const statForwarded = document.getElementById("statForwarded");
    const statFiltered = document.getElementById("statFiltered");
    const accountBadge = document.getElementById("accountBadge");
    const userAvatar = document.getElementById("userAvatar");
    const userName = document.getElementById("userName");
    const userUsername = document.getElementById("userUsername");
    const userPhone = document.getElementById("userPhone");
    const overviewWebhookUrl = document.getElementById("overviewWebhookUrl");
    const overviewRecentTable = document.getElementById("overviewRecentTable");

    const channelSearchInput = document.getElementById("channelSearchInput");
    const filterPills = document.querySelectorAll(".filter-pill");
    const btnFetchChannels = document.getElementById("btnFetchChannels");
    const channelsGrid = document.getElementById("channelsGrid");

    // Settings Tab Elements
    const settingsForm = document.getElementById("settingsForm");
    const inputWebhookUrlAlt = document.getElementById("inputWebhookUrlAlt");
    const inputPrefix = document.getElementById("inputPrefix");
    const inputSuffix = document.getElementById("inputSuffix");
    const btnSaveSettings = document.getElementById("btnSaveSettings");
    const btnGoToSettings = document.getElementById("btnGoToSettings");

    // Sandbox Preview
    const sandboxSampleText = document.getElementById("sandboxSampleText");
    const sandboxResultText = document.getElementById("sandboxResultText");

    // Logs Tab
    const fullLogsTable = document.getElementById("fullLogsTable");
    const btnRefreshLogs = document.getElementById("btnRefreshLogs");

    // Modals
    const loginModal = document.getElementById("loginModal");
    const btnOpenLoginModal = document.getElementById("btnOpenLoginModal");
    const btnCloseLoginModal = document.getElementById("btnCloseLoginModal");
    const loginStep1 = document.getElementById("loginStep1");
    const loginStep2 = document.getElementById("loginStep2");
    const loginPhoneNumber = document.getElementById("loginPhoneNumber");
    const btnSendPhoneCode = document.getElementById("btnSendPhoneCode");
    const loginCode = document.getElementById("loginCode");
    const loginPassword = document.getElementById("loginPassword");
    const btnVerifyCode = document.getElementById("btnVerifyCode");

    const sendMessageModal = document.getElementById("sendMessageModal");
    const btnCloseSendModal = document.getElementById("btnCloseSendModal");
    const sendMessageForm = document.getElementById("sendMessageForm");
    const sendDestinationChat = document.getElementById("sendDestinationChat");
    const sendDestinationId = document.getElementById("sendDestinationId");
    const sendMessageText = document.getElementById("sendMessageText");

    // Sample text for live modifier tester
    let activeSampleMessageText = "Bhim 2 hour Loot\n\nSend ₹20 or more and get upto ₹20 Cashback\n\nDate: 20th December, 2025\nTime: 3:00 PM to 5:00 PM\n\nDownload Now: https://bitli.in/GrE8HmE\n\nValid Once Per User";

    // --- Tab Navigation Setup ---
    const tabMetaData = {
        "tab-studio": { title: "Side-by-Side Sync Studio", subtitle: "Source Channel Extract ➔ Live Modifier Engine ➔ Destination Channel Paste" },
        "tab-overview": { title: "Dashboard Overview", subtitle: "Real-time Telegram message listener & n8n webhook automation" },
        "tab-channels": { title: "Channels & Chats Explorer", subtitle: "Browse, filter, and compose messages to your Telegram channels and chats" },
        "tab-n8n": { title: "n8n Webhook & Rules Engine", subtitle: "Configure dynamic text transformations, filters, and test rules live" },
        "tab-logs": { title: "Live Sync Activity Feed", subtitle: "Real-time stream of intercepted messages and n8n webhook responses" }
    };

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");
            
            navButtons.forEach(b => b.classList.remove("active"));
            tabContents.forEach(t => t.classList.remove("active"));

            btn.classList.add("active");
            const activeTabEl = document.getElementById(targetTab);
            if (activeTabEl) activeTabEl.classList.add("active");

            if (tabMetaData[targetTab]) {
                pageTitle.textContent = tabMetaData[targetTab].title;
                pageSubtitle.textContent = tabMetaData[targetTab].subtitle;
            }

            if (targetTab === "tab-channels" && state.channels.length === 0) {
                fetchChannels();
            } else if (targetTab === "tab-logs") {
                fetchMessages();
            }
        });
    });

    if (btnGoToSettings) {
        btnGoToSettings.addEventListener("click", () => {
            const n8nNavBtn = document.querySelector('[data-tab="tab-n8n"]');
            if (n8nNavBtn) n8nNavBtn.click();
        });
    }

    // --- Dynamic Multi-Rule UI Renderer ---
    function renderRuleRows() {
        if (!rulesRowsContainer) return;

        if (state.replacementRules.length === 0) {
            rulesRowsContainer.innerHTML = '<div class="text-muted" style="font-size: 11px; padding: 4px 0;">No individual rules added. Click "+ Add Rule" above or use quick mode below.</div>';
            return;
        }

        rulesRowsContainer.innerHTML = state.replacementRules.map((rule, idx) => `
            <div class="rule-row-item">
                <input type="text" class="form-control rule-find-input" data-idx="${idx}" placeholder="Find word" value="${escapeAttribute(rule.find || '')}">
                <input type="text" class="form-control rule-replace-input" data-idx="${idx}" placeholder="Replace with" value="${escapeAttribute(rule.replace || '')}">
                <button type="button" class="btn-delete-rule" data-idx="${idx}" title="Delete Rule">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `).join("");

        // Attach listeners for dynamic input edits
        document.querySelectorAll(".rule-find-input").forEach(input => {
            input.addEventListener("input", (e) => {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                state.replacementRules[idx].find = e.target.value;
                updateStudioSandbox();
            });
        });

        document.querySelectorAll(".rule-replace-input").forEach(input => {
            input.addEventListener("input", (e) => {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                state.replacementRules[idx].replace = e.target.value;
                updateStudioSandbox();
            });
        });

        document.querySelectorAll(".btn-delete-rule").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(btn.getAttribute("data-idx"));
                state.replacementRules.splice(idx, 1);
                renderRuleRows();
                updateStudioSandbox();
            });
        });
    }

    if (btnAddRuleRow) {
        btnAddRuleRow.addEventListener("click", () => {
            state.replacementRules.push({ find: "", replace: "" });
            renderRuleRows();
            updateStudioSandbox();
        });
    }

    // --- API Service Calls ---
    async function fetchStatus() {
        try {
            const res = await fetch("/api/status");
            const data = await res.json();
            
            state.connected = data.connected;
            state.authorized = data.authorized;
            state.user = data.user;
            state.settings = data.settings || {};
            state.replacementRules = data.settings.replacement_rules || [];

            updateStatusUI(data);
            populateSettingsUI(data.settings);
            renderRuleRows();
            updateStudioSandbox();
            
            if (state.channels.length === 0) {
                fetchChannels();
            }
        } catch (err) {
            console.error("Error fetching status:", err);
            sidebarStatusTitle.textContent = "Offline";
            sidebarStatusDot.className = "status-indicator-dot offline";
            headerConnectionBadge.className = "pill-badge status-disconnected";
            headerConnectionBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Offline';
        }
    }

    function updateStatusUI(data) {
        if (data.connected && data.authorized) {
            sidebarStatusTitle.textContent = "Telegram Connected";
            sidebarStatusUser.textContent = data.user ? `@${data.user.username || data.user.first_name}` : "Authenticated";
            sidebarStatusDot.className = "status-indicator-dot online";

            headerConnectionBadge.className = "pill-badge status-connected";
            headerConnectionBadge.innerHTML = '<i class="fa-solid fa-wifi"></i> Connected';

            accountBadge.className = "badge badge-success";
            accountBadge.textContent = "Signed In";

            if (data.user) {
                userName.textContent = `${data.user.first_name} ${data.user.last_name}`.trim();
                userUsername.textContent = data.user.username ? `@${data.user.username}` : "No username";
                userPhone.textContent = `Phone: +${data.user.phone}`;
                userAvatar.textContent = (data.user.first_name || "T")[0].toUpperCase();
            }
        } else {
            sidebarStatusTitle.textContent = "Disconnected / Not Signed In";
            sidebarStatusUser.textContent = "Action required";
            sidebarStatusDot.className = "status-indicator-dot offline";

            headerConnectionBadge.className = "pill-badge status-disconnected";
            headerConnectionBadge.innerHTML = '<i class="fa-solid fa-plug"></i> Not Authenticated';

            accountBadge.className = "badge badge-danger";
            accountBadge.textContent = "Signed Out";
            userName.textContent = "Not Signed In";
            userUsername.textContent = "Click button below to sign in";
            userPhone.textContent = "--";
            userAvatar.textContent = "?";
        }

        if (data.stats) {
            statReceived.textContent = data.stats.received || 0;
            statForwarded.textContent = data.stats.forwarded || 0;
            statFiltered.textContent = data.stats.filtered || 0;
        }
    }

    // --- Channels System ---
    async function fetchChannels() {
        try {
            const res = await fetch("/api/channels");
            const data = await res.json();
            if (data.success) {
                state.channels = data.channels || [];
                populateStudioDropdowns();
                renderChannelsGrid();
            }
        } catch (err) {
            console.error("Error fetching channels:", err);
        }
    }

    function populateStudioDropdowns() {
        if (!selectSourceChannel || !selectDestChannel) return;

        const currentSource = state.settings.source_channel_id || "all";
        const currentDest = state.settings.destination_channel_id || "";

        let sourceOptions = '<option value="all">⚡ All Incoming Chats (Global Extract)</option>';
        let destOptions = '<option value="">-- Select Destination Channel --</option>';

        state.channels.forEach(ch => {
            const selectedSource = (ch.id === currentSource) ? 'selected' : '';
            const selectedDest = (ch.id === currentDest) ? 'selected' : '';

            sourceOptions += `<option value="${ch.id}" ${selectedSource}>${escapeHtml(ch.name)} (${ch.type})</option>`;
            destOptions += `<option value="${ch.id}" ${selectedDest}>${escapeHtml(ch.name)} (${ch.type})</option>`;
        });

        selectSourceChannel.innerHTML = sourceOptions;
        selectDestChannel.innerHTML = destOptions;

        updateStudioPanelCards();
    }

    function updateStudioPanelCards() {
        const sourceVal = selectSourceChannel.value;
        const destVal = selectDestChannel.value;

        if (sourceVal === "all") {
            sourceChannelSubtext.textContent = "Global Extractor";
            sourceIdBadge.textContent = "ALL_CHATS";
            fetchSourceHistory("all");
        } else {
            const found = state.channels.find(c => c.id === sourceVal);
            if (found) {
                sourceChannelSubtext.textContent = found.name;
                sourceIdBadge.textContent = found.id;
                fetchSourceHistory(found.id);
            }
        }

        if (!destVal) {
            destChannelSubtext.textContent = "Select Target";
            destIdBadge.textContent = "NO_TARGET";
            destChatFeed.innerHTML = '<div class="loading-spinner-container text-muted"><i class="fa-solid fa-arrow-right-to-bracket"></i> Select destination channel in top control bar...</div>';
        } else {
            const found = state.channels.find(c => c.id === destVal);
            if (found) {
                destChannelSubtext.textContent = found.name;
                destIdBadge.textContent = found.id;
                fetchDestHistory(found.id);
            }
        }
    }

    selectSourceChannel.addEventListener("change", updateStudioPanelCards);
    selectDestChannel.addEventListener("change", updateStudioPanelCards);

    if (btnQuickSend) {
        btnQuickSend.addEventListener("click", () => {
            const destVal = selectDestChannel.value;
            if (!destVal) return alert("Please select a Destination Channel first!");
            const found = state.channels.find(c => c.id === destVal);
            openSendMessageModal(destVal, found ? found.name : destVal);
        });
    }

    // --- Chat History Fetchers ---
    async function fetchSourceHistory(chatId) {
        if (chatId === "all") {
            renderSourceChatFeed(state.messages.map(m => ({
                id: m.id || 1,
                text: m.raw_message,
                sender_name: m.chat_name,
                date: m.date
            })));
            return;
        }

        sourceChatFeed.innerHTML = '<div class="loading-spinner-container"><i class="fa-solid fa-spinner fa-spin"></i> Loading source messages...</div>';
        try {
            const res = await fetch(`/api/history/${chatId}`);
            const data = await res.json();
            if (data.success) {
                state.sourceHistory = data.messages || [];
                const found = state.channels.find(c => c.id === chatId);
                renderSourceChatFeed(state.sourceHistory, found ? found.name : 'Source');
            }
        } catch (err) {
            sourceChatFeed.innerHTML = `<div class="text-muted text-center" style="padding: 20px;">Error loading messages: ${err}</div>`;
        }
    }

    async function fetchDestHistory(chatId) {
        if (!chatId) return;

        destChatFeed.innerHTML = '<div class="loading-spinner-container"><i class="fa-solid fa-spinner fa-spin"></i> Loading destination messages...</div>';
        try {
            const res = await fetch(`/api/history/${chatId}`);
            const data = await res.json();
            if (data.success) {
                state.destHistory = data.messages || [];
                const found = state.channels.find(c => c.id === chatId);
                renderDestChatFeed(state.destHistory, found ? found.name : 'Target');
            }
        } catch (err) {
            destChatFeed.innerHTML = `<div class="text-muted text-center" style="padding: 20px;">Error loading target messages: ${err}</div>`;
        }
    }

    function renderSourceChatFeed(messages, defaultChannelName = 'Source') {
        if (!messages || messages.length === 0) {
            sourceChatFeed.innerHTML = '<div class="text-muted text-center" style="padding: 20px;">No messages found in source channel.</div>';
            return;
        }

        sourceChatFeed.innerHTML = messages.map((m, index) => {
            const channelName = m.sender_name || defaultChannelName;
            const text = m.text || m.raw_message || '';
            const msgId = m.id || (index + 1);

            return `
                <div class="source-message-card">
                    <div class="msg-card-header">
                        <span class="msg-sender-title"><i class="fa-solid fa-inbox text-blue"></i> ${escapeHtml(channelName)}</span>
                        <span class="msg-timestamp">${m.date || ''}</span>
                    </div>
                    <div class="msg-card-body">${escapeHtml(text)}</div>
                    <div class="msg-card-footer">
                        <span class="badge badge-id-blue">ID: ${msgId}</span>
                        <button class="btn-load-modifier" data-text="${escapeAttribute(text)}">
                            <i class="fa-solid fa-code-branch"></i> % Load into Modifier
                        </button>
                    </div>
                </div>
            `;
        }).join("");

        document.querySelectorAll(".btn-load-modifier").forEach(btn => {
            btn.addEventListener("click", () => {
                const text = btn.getAttribute("data-text");
                activeSampleMessageText = text;
                updateStudioSandbox();
                studioTransformedPreview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        });
    }

    function renderDestChatFeed(messages, defaultChannelName = 'Target') {
        if (!messages || messages.length === 0) {
            destChatFeed.innerHTML = '<div class="text-muted text-center" style="padding: 20px;">No messages posted to destination yet.</div>';
            return;
        }

        destChatFeed.innerHTML = messages.map(m => `
            <div class="dest-message-card">
                <div class="msg-card-header">
                    <span class="msg-sender-title"><i class="fa-solid fa-circle-check text-green"></i> ${escapeHtml(defaultChannelName)}</span>
                    <span class="msg-timestamp">${m.date || ''}</span>
                </div>
                <div class="msg-card-body">${escapeHtml(m.text || m.raw_message || '')}</div>
                <div class="msg-card-footer">
                    <span class="badge badge-success">Posted</span>
                </div>
            </div>
        `).join("");
    }

    if (btnRefreshSourceChat) btnRefreshSourceChat.addEventListener("click", () => updateStudioPanelCards());
    if (btnRefreshDestChat) btnRefreshDestChat.addEventListener("click", () => updateStudioPanelCards());

    // --- Settings & Text Rules Engine ---
    function populateSettingsUI(settings) {
        if (!settings) return;

        inputWebhookUrl.value = settings.webhook_url || "";
        if (inputWebhookUrlAlt) inputWebhookUrlAlt.value = settings.webhook_url || "";
        inputPrefix.value = settings.text_prefix || "";
        inputSuffix.value = settings.text_suffix || "";
        inputFindText.value = settings.find_text || "";
        inputReplaceText.value = settings.replace_text || "";
        selectFilterMode.value = settings.filter_mode || "all";

        switchAutoTelegram.checked = settings.auto_post_telegram ?? true;
        studioPrefix.value = settings.text_prefix || "";
        studioSuffix.value = settings.text_suffix || "";
        studioFind.value = settings.find_text || "";
        studioReplace.value = settings.replace_text || "";
        studioKeyword.value = settings.keyword_filter || "";

        chkOverrideLinks.checked = settings.override_all_links ?? false;
        inputCustomLinkUrl.value = settings.custom_link_url || "";
        chkRemoveLinks.checked = settings.remove_all_links ?? false;

        if (overviewWebhookUrl) {
            overviewWebhookUrl.textContent = settings.webhook_url || "Not Configured";
        }
    }

    // Save Studio Rules
    if (btnSaveStudioRules) {
        btnSaveStudioRules.addEventListener("click", async () => {
            btnSaveStudioRules.disabled = true;
            btnSaveStudioRules.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            const payload = {
                webhook_url: inputWebhookUrl.value,
                source_channel_id: selectSourceChannel.value,
                destination_channel_id: selectDestChannel.value,
                auto_post_telegram: switchAutoTelegram.checked,
                auto_post_n8n: true,
                text_prefix: studioPrefix.value,
                text_suffix: studioSuffix.value,
                find_text: studioFind.value,
                replace_text: studioReplace.value,
                replacement_rules: state.replacementRules,
                override_all_links: chkOverrideLinks.checked,
                custom_link_url: inputCustomLinkUrl.value,
                remove_all_links: chkRemoveLinks.checked,
                keyword_filter: studioKeyword.value,
                filter_mode: selectFilterMode.value
            };

            try {
                const res = await fetch("/api/config", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) {
                    state.settings = data.settings;
                    populateSettingsUI(data.settings);
                    alert("✅ Multi-Rule Modifier Engine Settings Saved!");
                }
            } catch (err) {
                alert("❌ Error saving studio rules: " + err);
            } finally {
                btnSaveStudioRules.disabled = false;
                btnSaveStudioRules.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Rules';
            }
        });
    }

    // --- Live Studio Sandbox Preview (Multi-Rule & Smart Link Engine) ---
    function updateStudioSandbox() {
        let text = activeSampleMessageText;

        // 1. Structured Multi-Rules
        if (state.replacementRules && state.replacementRules.length > 0) {
            state.replacementRules.forEach(rule => {
                if (rule.find) {
                    text = text.replace(new RegExp(escapeRegExp(rule.find), 'g'), rule.replace || '');
                }
            });
        }

        // 2. Bulk Comma-Separated Mode
        const findVal = studioFind.value;
        const replaceVal = studioReplace.value;

        if (findVal) {
            const findList = findVal.split(",").map(f => f.trim()).filter(f => f);
            const replaceList = replaceVal.split(",").map(r => r.trim());

            findList.forEach((fWord, i) => {
                const rWord = (i < replaceList.length) ? replaceList[i] : (replaceList.length > 0 ? replaceList[replaceList.length - 1] : "");
                text = text.replace(new RegExp(escapeRegExp(fWord), 'g'), rWord);
            });
        }

        // 3. Smart Universal Link Override / Link Removal
        const urlPattern = /https?:\/\/[^\s<>"'\)]+/g;
        if (chkRemoveLinks && chkRemoveLinks.checked) {
            text = text.replace(urlPattern, '');
        } else if (chkOverrideLinks && chkOverrideLinks.checked && inputCustomLinkUrl.value.trim()) {
            text = text.replace(urlPattern, inputCustomLinkUrl.value.trim());
        }

        // 4. Prefix & Suffix
        const prefixVal = studioPrefix.value;
        const suffixVal = studioSuffix.value;

        if (prefixVal) text = `${prefixVal}${text}`;
        if (suffixVal) text = `${text}${suffixVal}`;

        studioTransformedPreview.textContent = text;
        if (sandboxResultText) sandboxResultText.textContent = text;
    }

    [studioPrefix, studioSuffix, studioFind, studioReplace, studioKeyword, selectFilterMode, chkOverrideLinks, inputCustomLinkUrl, chkRemoveLinks].forEach(el => {
        if (el) {
            el.addEventListener("input", updateStudioSandbox);
            el.addEventListener("change", updateStudioSandbox);
        }
    });

    // --- Channels Explorer UI ---
    function renderChannelsGrid() {
        if (!channelsGrid) return;
        let filtered = state.channels;

        if (state.activeChannelFilter !== "all") {
            filtered = filtered.filter(c => c.type.toLowerCase().includes(state.activeChannelFilter.toLowerCase()));
        }

        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            filtered = filtered.filter(c => c.name.toLowerCase().includes(q) || c.id.includes(q));
        }

        if (filtered.length === 0) {
            channelsGrid.innerHTML = `
                <div class="card glass-card text-center full-width-card" style="padding: 40px; grid-column: 1 / -1;">
                    <i class="fa-solid fa-comments" style="font-size: 36px; color: var(--text-muted); margin-bottom: 12px;"></i>
                    <h4>No chats found matching criteria</h4>
                </div>
            `;
            return;
        }

        channelsGrid.innerHTML = filtered.map(chat => {
            let iconClass = "fa-user";
            if (chat.is_channel) iconClass = "fa-bullhorn";
            else if (chat.is_group) iconClass = "fa-users";

            return `
                <div class="channel-card">
                    <div class="channel-card-top">
                        <div class="channel-icon-box"><i class="fa-solid ${iconClass}"></i></div>
                        <div class="channel-info">
                            <h4>${escapeHtml(chat.name)}</h4>
                            <span class="channel-id-tag">ID: ${chat.id}</span>
                        </div>
                    </div>
                    <div class="channel-card-bottom">
                        <span class="chat-type-badge">${chat.type}</span>
                        <button class="btn btn-outline btn-sm btn-compose-msg" data-id="${chat.id}" data-name="${escapeHtml(chat.name)}">
                            <i class="fa-solid fa-paper-plane"></i> Send
                        </button>
                    </div>
                </div>
            `;
        }).join("");

        document.querySelectorAll(".btn-compose-msg").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-id");
                const name = btn.getAttribute("data-name");
                openSendMessageModal(id, name);
            });
        });
    }

    filterPills.forEach(pill => {
        pill.addEventListener("click", () => {
            filterPills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            state.activeChannelFilter = pill.getAttribute("data-filter");
            renderChannelsGrid();
        });
    });

    if (channelSearchInput) {
        channelSearchInput.addEventListener("input", (e) => {
            state.searchQuery = e.target.value;
            renderChannelsGrid();
        });
    }

    if (btnFetchChannels) btnFetchChannels.addEventListener("click", fetchChannels);

    // --- Live Messages Stream ---
    async function fetchMessages() {
        try {
            const res = await fetch("/api/messages");
            const data = await res.json();
            if (data.success) {
                state.messages = data.messages || [];
                renderMessagesTables(state.messages);

                if (selectSourceChannel && selectSourceChannel.value === "all") {
                    renderSourceChatFeed(state.messages.map(m => ({
                        id: m.id,
                        text: m.raw_message,
                        sender_name: m.chat_name,
                        date: m.date
                    })));
                }
            }
        } catch (err) {
            console.error("Error fetching message logs:", err);
        }
    }

    function renderMessagesTables(messages) {
        if (!messages || messages.length === 0) {
            const emptyHtml = '<tr><td colspan="6" class="text-center text-muted">No messages intercepted yet.</td></tr>';
            if (overviewRecentTable) overviewRecentTable.innerHTML = emptyHtml;
            if (fullLogsTable) fullLogsTable.innerHTML = emptyHtml;
            return;
        }

        const overviewRows = messages.slice(0, 5).map(m => `
            <tr>
                <td>${m.date}</td>
                <td><strong>${escapeHtml(m.chat_name)}</strong></td>
                <td><code>${escapeHtml(m.raw_message)}</code></td>
                <td><code style="color: var(--accent-green);">${escapeHtml(m.transformed_message)}</code></td>
                <td><span class="badge ${m.status.includes('sent') || m.status.includes('synced') ? 'badge-success' : 'badge-warning'}">${m.status}</span></td>
            </tr>
        `).join("");
        if (overviewRecentTable) overviewRecentTable.innerHTML = overviewRows;

        const fullRows = messages.map(m => `
            <tr>
                <td>${m.date}</td>
                <td><strong>${escapeHtml(m.chat_name)}</strong></td>
                <td><span class="channel-id-tag">${m.chat_id}</span></td>
                <td><code>${escapeHtml(m.raw_message)}</code></td>
                <td><code style="color: var(--accent-green);">${escapeHtml(m.transformed_message)}</code></td>
                <td><span class="badge ${m.status.includes('sent') || m.status.includes('synced') ? 'badge-success' : 'badge-warning'}">${m.status}</span></td>
            </tr>
        `).join("");
        if (fullLogsTable) fullLogsTable.innerHTML = fullRows;
    }

    if (btnRefreshLogs) btnRefreshLogs.addEventListener("click", fetchMessages);
    if (btnRefreshStatus) btnRefreshStatus.addEventListener("click", fetchStatus);

    // --- Modals Logic ---
    if (btnOpenLoginModal) btnOpenLoginModal.addEventListener("click", () => loginModal.classList.add("active"));
    if (btnCloseLoginModal) btnCloseLoginModal.addEventListener("click", () => loginModal.classList.remove("active"));
    if (btnCloseSendModal) btnCloseSendModal.addEventListener("click", () => sendMessageModal.classList.remove("active"));

    // Send Phone Code
    if (btnSendPhoneCode) {
        btnSendPhoneCode.addEventListener("click", async () => {
            const phone = loginPhoneNumber.value.trim();
            if (!phone) return alert("Please enter phone number");

            btnSendPhoneCode.disabled = true;
            btnSendPhoneCode.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

            try {
                const res = await fetch("/api/auth/send-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phone_number: phone })
                });
                const data = await res.json();
                if (data.success) {
                    loginStep1.classList.add("hidden");
                    loginStep2.classList.remove("hidden");
                } else {
                    alert("Error: " + (data.detail || "Failed to send code"));
                }
            } catch (err) {
                alert("Error: " + err);
            } finally {
                btnSendPhoneCode.disabled = false;
                btnSendPhoneCode.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Verification Code';
            }
        });
    }

    // Verify Phone Code
    if (btnVerifyCode) {
        btnVerifyCode.addEventListener("click", async () => {
            const phone = loginPhoneNumber.value.trim();
            const code = loginCode.value.trim();
            const pwd = loginPassword.value.trim();

            if (!code) return alert("Please enter verification code");

            btnVerifyCode.disabled = true;
            btnVerifyCode.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';

            try {
                const res = await fetch("/api/auth/verify-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phone_number: phone, code: code, password: pwd })
                });
                const data = await res.json();
                if (data.success) {
                    alert("🎉 Logged in successfully!");
                    loginModal.classList.remove("active");
                    fetchStatus();
                } else {
                    alert("Error: " + (data.detail || "Invalid code"));
                }
            } catch (err) {
                alert("Error: " + err);
            } finally {
                btnVerifyCode.disabled = false;
                btnVerifyCode.innerHTML = '<i class="fa-solid fa-check"></i> Sign In';
            }
        });
    }

    // Open Send Message Modal
    function openSendMessageModal(chatId, chatName) {
        sendDestinationId.value = chatId;
        sendDestinationChat.value = `${chatName} (${chatId})`;
        sendMessageText.value = "";
        sendMessageModal.classList.add("active");
    }

    if (sendMessageForm) {
        sendMessageForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const targetId = sendDestinationId.value;
            const text = sendMessageText.value.trim();
            if (!text) return;

            btnSubmitSend.disabled = true;
            btnSubmitSend.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

            try {
                const res = await fetch("/api/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ destination_chat_id: targetId, message: text })
                });
                const data = await res.json();
                if (data.success) {
                    alert("✅ Message sent successfully!");
                    sendMessageModal.classList.remove("active");
                    updateStudioPanelCards();
                }
            } catch (err) {
                alert("❌ Error sending message: " + err);
            } finally {
                btnSubmitSend.disabled = false;
                btnSubmitSend.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Message';
            }
        });
    }

    // Helper Utilities
    function escapeHtml(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function escapeAttribute(str) {
        if (!str) return "";
        return str.replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // --- Init App Data ---
    fetchStatus();
    fetchMessages();
    setInterval(fetchMessages, 5000);
});
