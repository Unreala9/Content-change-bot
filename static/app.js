/* ==========================================================================
   Telegram Sync Side-by-Side Channel Mirror Studio - JavaScript Logic
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
        destHistory: []
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

    // Studio Toolbar Controls
    const selectSourceChannel = document.getElementById("selectSourceChannel");
    const toggleAutoPost = document.getElementById("toggleAutoPost");
    const selectDestChannel = document.getElementById("selectDestChannel");
    const btnStudioSendDirect = document.getElementById("btnStudioSendDirect");

    // Studio Column 1: Source
    const labelSourceChannelName = document.getElementById("labelSourceChannelName");
    const badgeSourceId = document.getElementById("badgeSourceId");
    const streamSourceFeed = document.getElementById("streamSourceFeed");
    const btnRefreshSourceStream = document.getElementById("btnRefreshSourceStream");

    // Studio Column 2: Modifier Engine
    const btnSaveStudioRules = document.getElementById("btnSaveStudioRules");
    const studioWebhookUrl = document.getElementById("studioWebhookUrl");
    const studioPrefix = document.getElementById("studioPrefix");
    const studioSuffix = document.getElementById("studioSuffix");
    const studioFindText = document.getElementById("studioFindText");
    const studioReplaceText = document.getElementById("studioReplaceText");
    const studioFilterMode = document.getElementById("studioFilterMode");
    const studioKeywordFilter = document.getElementById("studioKeywordFilter");
    const studioSampleText = document.getElementById("studioSampleText");
    const studioSandboxBadge = document.getElementById("studioSandboxBadge");
    const studioSandboxResult = document.getElementById("studioSandboxResult");
    const btnPostSandboxToDest = document.getElementById("btnPostSandboxToDest");

    // Studio Column 3: Destination
    const labelDestChannelName = document.getElementById("labelDestChannelName");
    const badgeDestId = document.getElementById("badgeDestId");
    const streamDestFeed = document.getElementById("streamDestFeed");
    const btnRefreshDestStream = document.getElementById("btnRefreshDestStream");

    // Overview Tab
    const statReceived = document.getElementById("statReceived");
    const statForwarded = document.getElementById("statForwarded");
    const statAutoPosted = document.getElementById("statAutoPosted");
    const statFiltered = document.getElementById("statFiltered");
    const accountBadge = document.getElementById("accountBadge");
    const userAvatar = document.getElementById("userAvatar");
    const userName = document.getElementById("userName");
    const userUsername = document.getElementById("userUsername");
    const userPhone = document.getElementById("userPhone");
    const overviewWebhookUrl = document.getElementById("overviewWebhookUrl");

    // Channels Tab
    const channelSearchInput = document.getElementById("channelSearchInput");
    const filterPills = document.querySelectorAll(".filter-pill");
    const btnFetchChannels = document.getElementById("btnFetchChannels");
    const channelsGrid = document.getElementById("channelsGrid");

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
    const btnSubmitSend = document.getElementById("btnSubmitSend");

    // --- Tab Navigation Setup ---
    const tabMetaData = {
        "tab-studio": { title: "Side-by-Side Channel Mirror Studio", subtitle: "Extract from Source Channel ➔ Modify with Engine ➔ Post to Destination Channel" },
        "tab-overview": { title: "Dashboard Overview", subtitle: "Real-time Telegram message listener & n8n webhook automation" },
        "tab-channels": { title: "Channels & Chats Explorer", subtitle: "Browse, filter, and compose messages to your Telegram channels and chats" },
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
            } else if (targetTab === "tab-studio") {
                fetchSourceStream();
                fetchDestStream();
            }
        });
    });

    // --- API Service Calls ---
    async function fetchStatus() {
        try {
            const res = await fetch("/api/status");
            const data = await res.json();
            
            state.connected = data.connected;
            state.authorized = data.authorized;
            state.user = data.user;
            state.settings = data.settings || {};

            updateStatusUI(data);
            populateSettingsUI(data.settings);
            updateSandboxPreview();
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

            if (accountBadge) {
                accountBadge.className = "badge badge-success";
                accountBadge.textContent = "Signed In";
            }

            if (data.user && userName) {
                userName.textContent = `${data.user.first_name} ${data.user.last_name || ""}`.trim();
                if (userUsername) userUsername.textContent = data.user.username ? `@${data.user.username}` : "No username";
                if (userPhone) userPhone.textContent = `Phone: +${data.user.phone}`;
                if (userAvatar) userAvatar.textContent = (data.user.first_name || "T")[0].toUpperCase();
            }
        } else {
            sidebarStatusTitle.textContent = "Disconnected / Not Signed In";
            sidebarStatusUser.textContent = "Action required";
            sidebarStatusDot.className = "status-indicator-dot offline";

            headerConnectionBadge.className = "pill-badge status-disconnected";
            headerConnectionBadge.innerHTML = '<i class="fa-solid fa-plug"></i> Not Authenticated';

            if (accountBadge) {
                accountBadge.className = "badge badge-danger";
                accountBadge.textContent = "Signed Out";
            }
            if (userName) userName.textContent = "Not Signed In";
            if (userUsername) userUsername.textContent = "Click button below to sign in";
            if (userPhone) userPhone.textContent = "--";
            if (userAvatar) userAvatar.textContent = "?";
        }

        if (data.stats) {
            if (statReceived) statReceived.textContent = data.stats.received || 0;
            if (statForwarded) statForwarded.textContent = data.stats.forwarded || 0;
            if (statAutoPosted) statAutoPosted.textContent = data.stats.auto_posted || 0;
            if (statFiltered) statFiltered.textContent = data.stats.filtered || 0;
        }
    }

    // --- Channels System & Dropdowns ---
    async function fetchChannels() {
        if (channelsGrid) {
            channelsGrid.innerHTML = `
                <div class="loading-spinner-container">
                    <i class="fa-solid fa-spinner fa-spin"></i> Loading dialogs & channels from Telegram...
                </div>
            `;
        }
        try {
            const res = await fetch("/api/channels");
            const data = await res.json();
            if (data.success) {
                state.channels = data.channels || [];
                renderChannelsGrid();
                populateStudioDropdowns();
            }
        } catch (err) {
            console.error("Error fetching channels:", err);
            if (channelsGrid) {
                channelsGrid.innerHTML = `
                    <div class="card glass-card text-center" style="padding: 30px;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 32px; color: var(--accent-orange); margin-bottom: 12px;"></i>
                        <h4>Unable to load Telegram channels</h4>
                        <p class="text-muted">Ensure your Telegram account is authenticated.</p>
                    </div>
                `;
            }
        }
    }

    function populateStudioDropdowns() {
        if (!selectSourceChannel || !selectDestChannel) return;

        let sourceHtml = '<option value="all">⚡ All Incoming Channels & Chats</option>';
        let destHtml = '<option value="">Select Destination Channel...</option>';

        state.channels.forEach(ch => {
            let icon = ch.is_channel ? "📢" : (ch.is_group ? "👥" : "👤");
            sourceHtml += `<option value="${ch.id}">${icon} ${escapeHtml(ch.name)} (${ch.type})</option>`;
            destHtml += `<option value="${ch.id}">${icon} ${escapeHtml(ch.name)} (${ch.type})</option>`;
        });

        const currentSource = state.settings.source_channel_id || "all";
        const currentDest = state.settings.destination_channel_id || "";

        selectSourceChannel.innerHTML = sourceHtml;
        selectSourceChannel.value = currentSource;

        selectDestChannel.innerHTML = destHtml;
        selectDestChannel.value = currentDest;

        updateStudioChannelLabels();
        fetchSourceStream();
        fetchDestStream();
    }

    function updateStudioChannelLabels() {
        const sourceVal = selectSourceChannel.value;
        const destVal = selectDestChannel.value;

        if (sourceVal === "all") {
            labelSourceChannelName.textContent = "Listening to All Chats";
            badgeSourceId.textContent = "ALL";
        } else {
            const foundSource = state.channels.find(c => String(c.id) === String(sourceVal));
            labelSourceChannelName.textContent = foundSource ? foundSource.name : `Chat ID: ${sourceVal}`;
            badgeSourceId.textContent = sourceVal;
        }

        if (!destVal) {
            labelDestChannelName.textContent = "No Destination Selected";
            badgeDestId.textContent = "NONE";
            badgeDestId.className = "badge badge-warning";
        } else {
            const foundDest = state.channels.find(c => String(c.id) === String(destVal));
            labelDestChannelName.textContent = foundDest ? foundDest.name : `Chat ID: ${destVal}`;
            badgeDestId.textContent = destVal;
            badgeDestId.className = "badge badge-success";
        }
    }

    // --- Stream Feeds (Source & Destination History) ---
    async function fetchSourceStream() {
        const sourceVal = selectSourceChannel.value;
        if (sourceVal === "all") {
            renderSourceStream(state.messages);
            return;
        }

        try {
            const res = await fetch(`/api/channel-history?chat_id=${encodeURIComponent(sourceVal)}&limit=25`);
            const data = await res.json();
            if (data.success) {
                state.sourceHistory = data.messages || [];
                renderSourceStream(state.sourceHistory);
            }
        } catch (err) {
            console.error("Error fetching source history:", err);
        }
    }

    async function fetchDestStream() {
        const destVal = selectDestChannel.value;
        if (!destVal) {
            streamDestFeed.innerHTML = `
                <div class="stream-empty">
                    <i class="fa-solid fa-paper-plane"></i>
                    <p>Select a Destination Channel above to view posts...</p>
                </div>
            `;
            return;
        }

        try {
            const res = await fetch(`/api/channel-history?chat_id=${encodeURIComponent(destVal)}&limit=25`);
            const data = await res.json();
            if (data.success) {
                state.destHistory = data.messages || [];
                renderDestStream(state.destHistory);
            }
        } catch (err) {
            console.error("Error fetching dest history:", err);
        }
    }

    function renderSourceStream(messages) {
        if (!messages || messages.length === 0) {
            streamSourceFeed.innerHTML = `
                <div class="stream-empty">
                    <i class="fa-solid fa-wave-square"></i>
                    <p>No messages found in source channel feed.</p>
                </div>
            `;
            return;
        }

        streamSourceFeed.innerHTML = messages.map(m => {
            const rawText = m.text || m.raw_message || "";
            const sender = m.sender_name || m.chat_name || "Source Channel";
            const dateStr = m.date || "";

            return `
                <div class="tg-bubble">
                    <div class="tg-bubble-sender">
                        <span><i class="fa-solid fa-download text-blue"></i> ${escapeHtml(sender)}</span>
                        <span class="tg-status-subtitle">${escapeHtml(dateStr)}</span>
                    </div>
                    <div class="tg-bubble-text">${escapeHtml(rawText)}</div>
                    <div class="tg-bubble-meta">
                        <span>ID: ${m.id}</span>
                        <button class="tg-bubble-action-btn btn-load-modifier" data-text="${escapeHtml(rawText)}">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Load into Modifier
                        </button>
                    </div>
                </div>
            `;
        }).join("");

        document.querySelectorAll(".btn-load-modifier").forEach(btn => {
            btn.addEventListener("click", () => {
                const text = btn.getAttribute("data-text");
                studioSampleText.value = text;
                updateSandboxPreview();
                if (rulesDrawerModal) rulesDrawerModal.classList.add("active");
            });
        });
    }

    function renderDestStream(messages) {
        if (!messages || messages.length === 0) {
            streamDestFeed.innerHTML = `
                <div class="stream-empty">
                    <i class="fa-solid fa-paper-plane"></i>
                    <p>No posts in destination stream yet.</p>
                </div>
            `;
            return;
        }

        streamDestFeed.innerHTML = messages.map(m => {
            const text = m.text || m.transformed_message || "";
            const sender = m.sender_name || "Destination Channel";
            const dateStr = m.date || "";

            return `
                <div class="tg-bubble tg-bubble-dest">
                    <div class="tg-bubble-sender">
                        <span><i class="fa-solid fa-circle-check"></i> ${escapeHtml(sender)}</span>
                        <span style="font-weight: normal; opacity: 0.7;">${escapeHtml(dateStr)}</span>
                    </div>
                    <div class="tg-bubble-text">${escapeHtml(text)}</div>
                    <div class="tg-bubble-meta">
                        <span class="badge badge-success">✓✓ Posted</span>
                    </div>
                </div>
            `;
        }).join("");
    }

    // --- Toolbar Actions & Event Handlers ---
    if (selectSourceChannel) {
        selectSourceChannel.addEventListener("change", async () => {
            updateStudioChannelLabels();
            await fetch("/api/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source_channel_id: selectSourceChannel.value })
            });
            fetchSourceStream();
        });
    }

    if (selectDestChannel) {
        selectDestChannel.addEventListener("change", async () => {
            updateStudioChannelLabels();
            await fetch("/api/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ destination_channel_id: selectDestChannel.value })
            });
            fetchDestStream();
        });
    }

    if (toggleAutoPost) {
        toggleAutoPost.addEventListener("change", async () => {
            try {
                await fetch("/api/config", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ auto_post_telegram: toggleAutoPost.checked })
                });
            } catch (err) {
                console.error("Error updating auto-post toggle:", err);
            }
        });
    }

    if (btnSaveStudioRules) {
        btnSaveStudioRules.addEventListener("click", async () => {
            btnSaveStudioRules.disabled = true;
            btnSaveStudioRules.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            const payload = {
                webhook_url: studioWebhookUrl.value,
                text_prefix: studioPrefix.value,
                text_suffix: studioSuffix.value,
                find_text: studioFindText.value,
                replace_text: studioReplaceText.value,
                filter_mode: studioFilterMode.value,
                keyword_filter: studioKeywordFilter.value,
                auto_post_telegram: toggleAutoPost.checked,
                source_channel_id: selectSourceChannel.value,
                destination_channel_id: selectDestChannel.value
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
                    alert("✅ Modifier Rules & Preferences Saved Successfully!");
                    if (rulesDrawerModal) rulesDrawerModal.classList.remove("active");
                }
            } catch (err) {
                alert("❌ Error saving rules: " + err);
            } finally {
                btnSaveStudioRules.disabled = false;
                btnSaveStudioRules.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Rules';
            }
        });
    }

    if (btnPostSandboxToDest) {
        btnPostSandboxToDest.addEventListener("click", async () => {
            const destId = selectDestChannel.value || state.settings.destination_channel_id;
            if (!destId) {
                return alert("⚠️ Please select a Destination Channel from the top dropdown first!");
            }
            const textToSend = studioSandboxResult.textContent.trim();
            if (!textToSend || textToSend === "(empty)") {
                return alert("⚠️ Sandbox preview text is empty!");
            }

            btnPostSandboxToDest.disabled = true;
            btnPostSandboxToDest.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Posting...';

            try {
                const res = await fetch("/api/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ destination_chat_id: destId, message: textToSend })
                });
                const data = await res.json();
                if (data.success) {
                    alert("🚀 Modified message successfully posted to Destination Channel!");
                    fetchDestStream();
                } else {
                    alert("❌ Failed to post message: " + (data.detail || "Unknown error"));
                }
            } catch (err) {
                alert("❌ Error posting message: " + err);
            } finally {
                btnPostSandboxToDest.disabled = false;
                btnPostSandboxToDest.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Modified Message to Destination';
            }
        });
    }

    if (btnStudioSendDirect) {
        btnStudioSendDirect.addEventListener("click", () => {
            const destId = selectDestChannel.value;
            if (!destId) return alert("⚠️ Select a destination channel first!");
            const found = state.channels.find(c => String(c.id) === String(destId));
            openSendMessageModal(destId, found ? found.name : destId);
        });
    }

    if (btnRefreshSourceStream) btnRefreshSourceStream.addEventListener("click", fetchSourceStream);
    if (btnRefreshDestStream) btnRefreshDestStream.addEventListener("click", fetchDestStream);

    // --- Channels Grid Rendering (Directory Tab) ---
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
                    <p class="text-muted">Try adjusting your search query or filter pill.</p>
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

    // --- Settings Population ---
    function populateSettingsUI(settings) {
        if (!settings) return;
        studioWebhookUrl.value = settings.webhook_url || "";
        studioPrefix.value = settings.text_prefix || "";
        studioSuffix.value = settings.text_suffix || "";
        studioFindText.value = settings.find_text || "";
        studioReplaceText.value = settings.replace_text || "";
        studioFilterMode.value = settings.filter_mode || "all";
        studioKeywordFilter.value = settings.keyword_filter || "";
        toggleAutoPost.checked = !!settings.auto_post_telegram;

        if (overviewWebhookUrl) {
            overviewWebhookUrl.textContent = settings.webhook_url || "Not Configured";
        }
    }

    // --- Live Sandbox Preview Tester ---
    async function updateSandboxPreview() {
        const sampleText = studioSampleText.value || "";
        const payload = {
            sample_text: sampleText,
            text_prefix: studioPrefix.value,
            text_suffix: studioSuffix.value,
            find_text: studioFindText.value,
            replace_text: studioReplaceText.value,
            filter_mode: studioFilterMode.value,
            keyword_filter: studioKeywordFilter.value
        };

        try {
            const res = await fetch("/api/test-transform", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            studioSandboxResult.textContent = data.transformed_text || "(empty)";

            if (data.should_forward) {
                studioSandboxBadge.className = "badge badge-success";
                studioSandboxBadge.textContent = "Forward Allowed";
            } else {
                studioSandboxBadge.className = "badge badge-warning";
                studioSandboxBadge.textContent = "Skipped / Filtered";
            }
        } catch (err) {
            console.error("Sandbox preview error:", err);
        }
    }

    [studioSampleText, studioPrefix, studioSuffix, studioFindText, studioReplaceText, studioKeywordFilter, studioFilterMode].forEach(el => {
        if (el) {
            el.addEventListener("input", updateSandboxPreview);
            el.addEventListener("change", updateSandboxPreview);
        }
    });

    // --- Logs Stream ---
    async function fetchMessages() {
        try {
            const res = await fetch("/api/messages");
            const data = await res.json();
            if (data.success) {
                state.messages = data.messages || [];
                renderLogsTable(state.messages);
                if (selectSourceChannel && selectSourceChannel.value === "all") {
                    renderSourceStream(state.messages);
                }
            }
        } catch (err) {
            console.error("Error fetching message logs:", err);
        }
    }

    function renderLogsTable(messages) {
        if (!messages || messages.length === 0) {
            if (fullLogsTable) fullLogsTable.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No messages intercepted yet.</td></tr>';
            return;
        }

        const fullRows = messages.map(m => `
            <tr>
                <td>${m.date}</td>
                <td><strong>${escapeHtml(m.chat_name)}</strong></td>
                <td><span class="channel-id-tag">${m.chat_id}</span></td>
                <td><code>${escapeHtml(m.raw_message)}</code></td>
                <td><code style="color: var(--accent-green);">${escapeHtml(m.transformed_message)}</code></td>
                <td><span class="badge ${m.status.includes('sent') ? 'badge-success' : 'badge-warning'}">${m.status}</span></td>
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
                    fetchChannels();
                } else {
                    alert("Error: " + (data.detail || "Invalid code"));
                }
            } catch (err) {
                alert("Error: " + err);
            } finally {
                btnVerifyCode.disabled = false;
                btnVerifyCode.innerHTML = '<i class="fa-solid fa-check"></i> Sign In to Telegram';
            }
        });
    }

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
                    fetchDestStream();
                }
            } catch (err) {
                alert("❌ Error sending message: " + err);
            } finally {
                btnSubmitSend.disabled = false;
                btnSubmitSend.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Message';
            }
        });
    }

    // Rules Drawer Modal Handlers
    const rulesDrawerModal = document.getElementById("rulesDrawerModal");
    const btnOpenRulesModal = document.getElementById("btnOpenRulesModal");
    const btnBridgeOpenRules = document.getElementById("btnBridgeOpenRules");
    const btnCloseRulesDrawer = document.getElementById("btnCloseRulesDrawer");

    if (btnOpenRulesModal) btnOpenRulesModal.addEventListener("click", () => rulesDrawerModal && rulesDrawerModal.classList.add("active"));
    if (btnBridgeOpenRules) btnBridgeOpenRules.addEventListener("click", () => rulesDrawerModal && rulesDrawerModal.classList.add("active"));
    if (btnCloseRulesDrawer) btnCloseRulesDrawer.addEventListener("click", () => rulesDrawerModal && rulesDrawerModal.classList.remove("active"));

    function escapeHtml(str) {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // --- Init Application Data ---
    fetchStatus();
    fetchChannels();
    fetchMessages();
    setInterval(() => {
        fetchMessages();
        fetchSourceStream();
        fetchDestStream();
    }, 4000);
});

