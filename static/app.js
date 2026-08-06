/* ==========================================================================
   Telegram Sync & Side-by-Side Studio - Multi-User JavaScript App
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
        replacementRules: [], // Array of {find: "", replace: ""}
        supabaseConfigured: false,
        currentAuthTab: "login" // "login" or "register"
    };

    // --- API Fetch Wrapper with Bearer Token ---
    async function apiFetch(url, options = {}) {
        const token = localStorage.getItem("sb_access_token");
        const headers = options.headers || {};

        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        options.headers = headers;

        const res = await fetch(url, options);
        if (res.status === 401 && state.supabaseConfigured) {
            // Redirect to dedicated login page
            localStorage.removeItem("sb_access_token");
            window.location.href = "/login";
        }
        return res;
    }

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

    // Supabase Auth & Header Elements
    const supabaseAuthModal = document.getElementById("supabaseAuthModal");
    const tabAuthLogin = document.getElementById("tabAuthLogin");
    const tabAuthRegister = document.getElementById("tabAuthRegister");
    const formSupabaseAuth = document.getElementById("formSupabaseAuth");
    const authEmail = document.getElementById("authEmail");
    const authPassword = document.getElementById("authPassword");
    const btnSubmitAuth = document.getElementById("btnSubmitAuth");
    const authAlert = document.getElementById("authAlert");
    const headerUserEmail = document.getElementById("headerUserEmail");
    const btnLogoutSupabase = document.getElementById("btnLogoutSupabase");
    const btnConnectTelegram = document.getElementById("btnConnectTelegram");
    const btnConnectTelegramText = document.getElementById("btnConnectTelegramText");

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
    
    // Image & Media Elements
    const chkForwardMedia = document.getElementById("chkForwardMedia");
    const chkReplaceMedia = document.getElementById("chkReplaceMedia");
    const inputCustomMediaUrl = document.getElementById("inputCustomMediaUrl");

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
    const btnSubmitSend = document.getElementById("btnSubmitSend");

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

    // --- Supabase Authentication UI Handlers ---
    function showSupabaseAuthModal(msg = "") {
        if (!supabaseAuthModal) return;
        supabaseAuthModal.classList.add("active");
        if (msg && authAlert) {
            authAlert.className = "alert alert-danger";
            authAlert.textContent = msg;
            authAlert.classList.remove("hidden");
        } else if (authAlert) {
            authAlert.classList.add("hidden");
        }
    }

    function hideSupabaseAuthModal() {
        if (supabaseAuthModal) supabaseAuthModal.classList.remove("active");
    }

    if (tabAuthLogin && tabAuthRegister) {
        tabAuthLogin.addEventListener("click", () => {
            state.currentAuthTab = "login";
            tabAuthLogin.classList.add("active");
            tabAuthLogin.style.background = "";
            tabAuthLogin.style.color = "";
            tabAuthRegister.classList.remove("active");
            tabAuthRegister.style.background = "transparent";
            tabAuthRegister.style.color = "var(--muted-color, #707a8a)";
            btnSubmitAuth.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In to Platform';
        });

        tabAuthRegister.addEventListener("click", () => {
            state.currentAuthTab = "register";
            tabAuthRegister.classList.add("active");
            tabAuthRegister.style.background = "";
            tabAuthRegister.style.color = "";
            tabAuthLogin.classList.remove("active");
            tabAuthLogin.style.background = "transparent";
            tabAuthLogin.style.color = "var(--muted-color, #707a8a)";
            btnSubmitAuth.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
        });
    }

    if (formSupabaseAuth) {
        formSupabaseAuth.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = authEmail.value.trim();
            const password = authPassword.value.trim();
            if (!email || !password) return;

            btnSubmitAuth.disabled = true;
            btnSubmitAuth.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
            if (authAlert) authAlert.classList.add("hidden");

            const endpoint = state.currentAuthTab === "login" ? "/api/user/login" : "/api/user/signup";

            try {
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();

                if (res.ok && data.success) {
                    if (data.access_token) {
                        localStorage.setItem("sb_access_token", data.access_token);
                    }
                    if (authAlert) {
                        authAlert.className = "alert alert-success";
                        authAlert.textContent = data.message || "Authentication successful!";
                        authAlert.classList.remove("hidden");
                    }
                    setTimeout(() => {
                        hideSupabaseAuthModal();
                        fetchStatus();
                    }, 800);
                } else {
                    if (authAlert) {
                        authAlert.className = "alert alert-danger";
                        authAlert.textContent = data.detail || "Authentication failed.";
                        authAlert.classList.remove("hidden");
                    }
                }
            } catch (err) {
                if (authAlert) {
                    authAlert.className = "alert alert-danger";
                    authAlert.textContent = "Error connecting to server: " + err;
                    authAlert.classList.remove("hidden");
                }
            } finally {
                btnSubmitAuth.disabled = false;
                btnSubmitAuth.innerHTML = state.currentAuthTab === "login"
                    ? '<i class="fa-solid fa-right-to-bracket"></i> Sign In to Platform'
                    : '<i class="fa-solid fa-user-plus"></i> Create Account';
            }
        });
    }

    if (btnLogoutSupabase) {
        btnLogoutSupabase.addEventListener("click", () => {
            localStorage.removeItem("sb_access_token");
            window.location.href = "/login";
        });
    }

    if (btnConnectTelegram) {
        btnConnectTelegram.addEventListener("click", async () => {
            if (state.authorized) {
                if (confirm("Are you sure you want to disconnect your Telegram account from this profile?")) {
                    try {
                        const res = await apiFetch("/api/auth/disconnect", { method: "POST" });
                        const data = await res.json();
                        alert(data.message || "Telegram account disconnected.");
                        fetchStatus();
                    } catch (err) {
                        alert("Error disconnecting Telegram: " + err);
                    }
                }
            } else {
                if (loginModal) loginModal.classList.add("active");
            }
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
            const res = await apiFetch("/api/status");
            if (res.status === 401) return;

            const data = await res.json();
            
            state.connected = data.connected;
            state.authorized = data.authorized;
            state.user = data.user;
            state.settings = data.settings || {};
            state.replacementRules = data.settings.replacement_rules || [];
            state.supabaseConfigured = data.supabase_configured;

            if (data.supabase_configured && !localStorage.getItem("sb_access_token")) {
                window.location.href = "/login";
                return;
            }

            updateStatusUI(data);
            populateSettingsUI(data.settings);
            renderRuleRows();
            updateStudioSandbox();
            
            if (state.authorized && state.channels.length === 0) {
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
        if (headerUserEmail) {
            headerUserEmail.textContent = data.current_user_email || "Local User";
        }

        if (btnLogoutSupabase) {
            btnLogoutSupabase.style.display = data.supabase_configured ? "inline-block" : "none";
        }

        if (btnConnectTelegramText) {
            btnConnectTelegramText.textContent = data.authorized ? "Connected" : "Connect Telegram";
        }
        if (btnConnectTelegram) {
            btnConnectTelegram.className = data.authorized ? "btn btn-success btn-sm" : "btn btn-warning btn-sm";
        }

        if (data.authorized) {
            sidebarStatusTitle.textContent = "Telegram Connected";
            sidebarStatusUser.textContent = data.user ? `@${data.user.username || data.user.first_name}` : "Authenticated";
            sidebarStatusDot.className = "status-indicator-dot online";

            headerConnectionBadge.className = "pill-badge status-connected";
            headerConnectionBadge.innerHTML = '<i class="fa-solid fa-wifi"></i> Connected';

            accountBadge.className = "badge badge-success";
            accountBadge.textContent = "Signed In";

            if (data.user) {
                userName.textContent = `${data.user.first_name} ${data.user.last_name || ''}`.trim();
                userUsername.textContent = data.user.username ? `@${data.user.username}` : "No username";
                userPhone.textContent = `Phone: +${data.user.phone}`;
                userAvatar.textContent = (data.user.first_name || "T")[0].toUpperCase();
            }
        } else {
            sidebarStatusTitle.textContent = "Disconnected / Not Signed In";
            sidebarStatusUser.textContent = "Telegram Connection Required";
            sidebarStatusDot.className = "status-indicator-dot offline";

            headerConnectionBadge.className = "pill-badge status-disconnected";
            headerConnectionBadge.innerHTML = '<i class="fa-solid fa-plug"></i> Not Authenticated';

            accountBadge.className = "badge badge-danger";
            accountBadge.textContent = "Signed Out";
            userName.textContent = "Not Connected";
            userUsername.textContent = "Click 'Connect Telegram' to link account";
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
            const res = await apiFetch("/api/channels");
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
            const res = await apiFetch(`/api/history/${chatId}`);
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
            const res = await apiFetch(`/api/history/${chatId}`);
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
            
            const mediaHtml = m.media_path ? `
                <div class="msg-card-media">
                    <img src="${m.media_path}" alt="Media Attachment" class="message-image" loading="lazy" />
                </div>
            ` : '';

            return `
                <div class="source-message-card">
                    <div class="msg-card-header">
                        <span class="msg-sender-title"><i class="fa-solid fa-inbox text-blue"></i> ${escapeHtml(channelName)}</span>
                        <span class="msg-timestamp">${m.date || ''}</span>
                    </div>
                    ${mediaHtml}
                    <div class="msg-card-body">${escapeHtml(text)}</div>
                    <div class="msg-card-footer">
                        <span class="badge badge-id-blue">ID: ${msgId}</span>
                        <button class="btn-load-modifier" data-text="${escapeAttribute(text)}">
                            <i class="fa-solid fa-code-branch"></i> Load into Modifier
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

    function renderDestChatFeed(messages, defaultChannelName = 'Destination') {
        if (!messages || messages.length === 0) {
            destChatFeed.innerHTML = '<div class="text-muted text-center" style="padding: 20px;">No messages sent to destination channel yet.</div>';
            return;
        }

        destChatFeed.innerHTML = messages.map((m, index) => {
            const text = m.text || m.transformed_message || '';
            const msgId = m.id || (index + 1);

            return `
                <div class="dest-message-card">
                    <div class="msg-card-header">
                        <span class="msg-sender-title text-green"><i class="fa-solid fa-paper-plane"></i> ${escapeHtml(defaultChannelName)}</span>
                        <span class="msg-timestamp">${m.date || ''}</span>
                    </div>
                    <div class="msg-card-body">${escapeHtml(text)}</div>
                    <div class="msg-card-footer">
                        <span class="badge badge-id-green">ID: ${msgId}</span>
                        <span class="status-tag status-success"><i class="fa-solid fa-check-double"></i> Synced</span>
                    </div>
                </div>
            `;
        }).join("");
    }

    if (btnRefreshSourceChat) {
        btnRefreshSourceChat.addEventListener("click", () => fetchSourceHistory(selectSourceChannel.value));
    }
    if (btnRefreshDestChat) {
        btnRefreshDestChat.addEventListener("click", () => fetchDestHistory(selectDestChannel.value));
    }

    // --- Channels Explorer UI ---
    function renderChannelsGrid() {
        if (!channelsGrid) return;

        let filtered = state.channels.filter(ch => {
            const matchesQuery = ch.name.toLowerCase().includes(state.searchQuery.toLowerCase()) || ch.id.includes(state.searchQuery);
            if (state.activeChannelFilter === "all") return matchesQuery;
            if (state.activeChannelFilter === "channels") return matchesQuery && ch.is_channel;
            if (state.activeChannelFilter === "groups") return matchesQuery && ch.is_group;
            if (state.activeChannelFilter === "users") return matchesQuery && ch.is_user;
            return matchesQuery;
        });

        if (filtered.length === 0) {
            channelsGrid.innerHTML = '<div class="no-channels-card"><i class="fa-solid fa-folder-open"></i><p>No matching channels or chats found.</p></div>';
            return;
        }

        channelsGrid.innerHTML = filtered.map(ch => `
            <div class="channel-card">
                <div class="channel-card-header">
                    <div class="channel-icon">${ch.is_channel ? '<i class="fa-solid fa-bullhorn text-blue"></i>' : (ch.is_group ? '<i class="fa-solid fa-users text-purple"></i>' : '<i class="fa-solid fa-user text-green"></i>')}</div>
                    <div class="channel-info">
                        <h4>${escapeHtml(ch.name)}</h4>
                        <span class="channel-type-badge">${ch.type}</span>
                    </div>
                </div>
                <div class="channel-card-body">
                    <p><strong>Chat ID:</strong> <code>${ch.id}</code></p>
                    <p><strong>Unread:</strong> ${ch.unread_count}</p>
                </div>
                <div class="channel-card-actions">
                    <button class="btn btn-outline btn-xs btn-set-source" data-id="${ch.id}">Set as Source</button>
                    <button class="btn btn-primary btn-xs btn-set-dest" data-id="${ch.id}">Set as Dest</button>
                    <button class="btn btn-success btn-xs btn-open-send" data-id="${ch.id}" data-name="${escapeAttribute(ch.name)}"><i class="fa-solid fa-paper-plane"></i> Send</button>
                </div>
            </div>
        `).join("");

        if (chkForwardMedia) chkForwardMedia.checked = settings.forward_media ?? true;
        if (chkReplaceMedia) chkReplaceMedia.checked = settings.replace_media ?? false;
        if (inputCustomMediaUrl) inputCustomMediaUrl.value = settings.custom_media_url || "";

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
                filter_mode: selectFilterMode.value,
                forward_media: chkForwardMedia.checked,
                replace_media: chkReplaceMedia.checked,
                custom_media_url: inputCustomMediaUrl.value
            };

        document.querySelectorAll(".btn-open-send").forEach(b => {
            b.addEventListener("click", () => {
                const id = b.getAttribute("data-id");
                const name = b.getAttribute("data-name");
                openSendMessageModal(id, name);
            });
        });
    }

    // Save Settings Form
    if (settingsForm) {
        settingsForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            btnSaveSettings.disabled = true;
            btnSaveSettings.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            const payload = {
                webhook_url: inputWebhookUrlAlt.value,
                text_prefix: inputPrefix.value,
                text_suffix: inputSuffix.value,
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
                    alert("✅ Settings Saved Successfully!");
                }
            } catch (err) {
                alert("❌ Error saving settings: " + err);
            } finally {
                btnSaveSettings.disabled = false;
                btnSaveSettings.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Settings';
            }
        });
    }

    // --- Live Studio Sandbox Preview (Multi-Rule & Smart Link Engine) ---
    function updateStudioSandbox() {
        let text = activeSampleMessageText;

    filterPills.forEach(pill => {
        pill.addEventListener("click", () => {
            filterPills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            state.activeChannelFilter = pill.getAttribute("data-filter");
            renderChannelsGrid();
        });
    });

    if (btnFetchChannels) {
        btnFetchChannels.addEventListener("click", fetchChannels);
    }

    // --- Studio Sandbox Modifier Engine ---
    async function updateStudioSandbox() {
        const payload = {
            sample_text: activeSampleMessageText,
            text_prefix: studioPrefix ? studioPrefix.value : "",
            text_suffix: studioSuffix ? studioSuffix.value : "",
            find_text: studioFind ? studioFind.value : "",
            replace_text: studioReplace ? studioReplace.value : "",
            replacement_rules: state.replacementRules,
            override_all_links: chkOverrideLinks ? chkOverrideLinks.checked : false,
            custom_link_url: inputCustomLinkUrl ? inputCustomLinkUrl.value : "",
            remove_all_links: chkRemoveLinks ? chkRemoveLinks.checked : false,
            keyword_filter: studioKeyword ? studioKeyword.value : "",
            filter_mode: selectFilterMode ? selectFilterMode.value : "all"
        };

        if (sandboxSampleText) sandboxSampleText.value = activeSampleMessageText;

        try {
            const res = await apiFetch("/api/test-transform", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (studioTransformedPreview) studioTransformedPreview.textContent = data.transformed_text;
            if (sandboxResultText) sandboxResultText.value = data.transformed_text;

            if (sandboxStatusBadge) {
                if (data.should_forward) {
                    sandboxStatusBadge.className = "status-tag status-success";
                    sandboxStatusBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Passed Filter Rules';
                } else {
                    sandboxStatusBadge.className = "status-tag status-danger";
                    sandboxStatusBadge.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Filtered: ${data.reason}`;
                }
            }
        } catch (err) {
            console.error("Sandbox evaluation error:", err);
        }
    }

    [studioPrefix, studioSuffix, studioFind, studioReplace, studioKeyword, selectFilterMode, chkOverrideLinks, inputCustomLinkUrl, chkRemoveLinks, switchAutoTelegram].forEach(el => {
        if (el) el.addEventListener("input", updateStudioSandbox);
        if (el) el.addEventListener("change", updateStudioSandbox);
    });

    if (sandboxSampleText) {
        sandboxSampleText.addEventListener("input", (e) => {
            activeSampleMessageText = e.target.value;
            updateStudioSandbox();
        });
    }

    // --- Settings Sync ---
    function populateSettingsUI(s) {
        if (!s) return;
        if (inputWebhookUrl) inputWebhookUrl.value = s.webhook_url || "";
        if (inputWebhookUrlAlt) inputWebhookUrlAlt.value = s.webhook_url || "";
        if (overviewWebhookUrl) overviewWebhookUrl.value = s.webhook_url || "";

        if (studioPrefix) studioPrefix.value = s.text_prefix || "";
        if (inputPrefix) inputPrefix.value = s.text_prefix || "";
        if (studioSuffix) studioSuffix.value = s.text_suffix || "";
        if (inputSuffix) inputSuffix.value = s.text_suffix || "";

        if (studioFind) studioFind.value = s.find_text || "";
        if (studioReplace) studioReplace.value = s.replace_text || "";

        if (selectFilterMode) selectFilterMode.value = s.filter_mode || "all";
        if (studioKeyword) studioKeyword.value = s.keyword_filter || "";

        if (chkOverrideLinks) chkOverrideLinks.checked = s.override_all_links || false;
        if (inputCustomLinkUrl) inputCustomLinkUrl.value = s.custom_link_url || "";
        if (chkRemoveLinks) chkRemoveLinks.checked = s.remove_all_links || false;

        if (switchAutoTelegram) switchAutoTelegram.checked = s.auto_post_telegram !== false;
    }

    async function saveStudioSettings() {
        const payload = {
            webhook_url: inputWebhookUrl ? inputWebhookUrl.value : "",
            source_channel_id: selectSourceChannel ? selectSourceChannel.value : "all",
            destination_channel_id: selectDestChannel ? selectDestChannel.value : "",
            auto_post_telegram: switchAutoTelegram ? switchAutoTelegram.checked : true,
            text_prefix: studioPrefix ? studioPrefix.value : "",
            text_suffix: studioSuffix ? studioSuffix.value : "",
            find_text: studioFind ? studioFind.value : "",
            replace_text: studioReplace ? studioReplace.value : "",
            replacement_rules: state.replacementRules,
            override_all_links: chkOverrideLinks ? chkOverrideLinks.checked : false,
            custom_link_url: inputCustomLinkUrl ? inputCustomLinkUrl.value : "",
            remove_all_links: chkRemoveLinks ? chkRemoveLinks.checked : false,
            keyword_filter: studioKeyword ? studioKeyword.value : "",
            filter_mode: selectFilterMode ? selectFilterMode.value : "all"
        };

        try {
            const res = await apiFetch("/api/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                state.settings = data.settings;
                alert("✅ Sync & Rule settings saved to Supabase profile!");
            }
        } catch (err) {
            alert("Error saving settings: " + err);
        }
    }

    if (btnSaveStudioRules) btnSaveStudioRules.addEventListener("click", saveStudioSettings);
    if (btnSaveSettings) btnSaveSettings.addEventListener("click", saveStudioSettings);

    if (settingsForm) {
        settingsForm.addEventListener("submit", (e) => {
            e.preventDefault();
            if (inputWebhookUrlAlt && inputWebhookUrl) inputWebhookUrl.value = inputWebhookUrlAlt.value;
            if (inputPrefix && studioPrefix) studioPrefix.value = inputPrefix.value;
            if (inputSuffix && studioSuffix) studioSuffix.value = inputSuffix.value;
            saveStudioSettings();
        });
    }

    // --- Message Sync Logs & Feed ---
    async function fetchMessages() {
        try {
            const res = await apiFetch("/api/messages");
            const data = await res.json();
            if (data.success) {
                state.messages = data.messages || [];
                renderLogsFeed(state.messages);
                renderOverviewTable(state.messages.slice(0, 5));
                if (data.stats && statReceived) {
                    statReceived.textContent = data.stats.received || 0;
                    statForwarded.textContent = data.stats.forwarded || 0;
                    statFiltered.textContent = data.stats.filtered || 0;
                }
            }
        } catch (err) {
            console.error("Error fetching message feed:", err);
        }
    }

    function renderOverviewTable(messages) {
        if (!overviewRecentTable) return;
        if (!messages || messages.length === 0) {
            overviewRecentTable.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No messages intercepted yet.</td></tr>';
            return;
        }

        overviewRecentTable.innerHTML = messages.map(m => `
            <tr>
                <td>${formatIST(m.created_at || m.date)}</td>
                <td><strong>${escapeHtml(m.chat_name || 'Chat')}</strong></td>
                <td><div class="text-truncate" style="max-width: 250px;">${escapeHtml(m.transformed_message || m.raw_message || '')}</div></td>
                <td><span class="status-tag status-success">${m.status || 'Synced'}</span></td>
            </tr>
        `).join("");
    }

    function renderLogsFeed(messages) {
        if (!fullLogsTable) return;
        if (!messages || messages.length === 0) {
            fullLogsTable.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No message logs recorded yet.</td></tr>';
            return;
        }

        fullLogsTable.innerHTML = messages.map(m => `
            <tr>
                <td><code>${m.id || m.telegram_message_id || ''}</code></td>
                <td>${formatIST(m.created_at || m.date)}</td>
                <td><strong>${escapeHtml(m.chat_name || 'Chat')}</strong></td>
                <td><div class="text-truncate" style="max-width: 220px;" title="${escapeAttribute(m.raw_message || '')}">${escapeHtml(m.raw_message || '')}</div></td>
                <td><div class="text-truncate" style="max-width: 220px;" title="${escapeAttribute(m.transformed_message || '')}">${escapeHtml(m.transformed_message || '')}</div></td>
                <td><span class="status-tag ${m.status && m.status.includes('skipped') ? 'status-danger' : 'status-success'}">${m.status}</span></td>
            </tr>
        `).join("");
    }

    if (btnRefreshLogs) btnRefreshLogs.addEventListener("click", fetchMessages);
    if (btnRefreshStatus) btnRefreshStatus.addEventListener("click", fetchStatus);

    // --- Modal Controllers ---
    if (btnOpenLoginModal) {
        btnOpenLoginModal.addEventListener("click", () => {
            if (loginModal) loginModal.classList.add("active");
        });
    }
    if (btnCloseLoginModal) {
        btnCloseLoginModal.addEventListener("click", () => {
            if (loginModal) loginModal.classList.remove("active");
        });
    }
    if (btnCloseSendModal) {
        btnCloseSendModal.addEventListener("click", () => {
            if (sendMessageModal) sendMessageModal.classList.remove("active");
        });
    }

    // Send Telegram Phone Code
    if (btnSendPhoneCode) {
        btnSendPhoneCode.addEventListener("click", async () => {
            const phone = loginPhoneNumber.value.trim();
            if (!phone) return alert("Please enter phone number (+91...)");

            btnSendPhoneCode.disabled = true;
            btnSendPhoneCode.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending Code...';

            try {
                const res = await apiFetch("/api/auth/send-code", {
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
                const res = await apiFetch("/api/auth/verify-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phone_number: phone, code: code, password: pwd })
                });
                const data = await res.json();
                if (data.success) {
                    alert("🎉 Telegram connected successfully!");
                    if (loginModal) loginModal.classList.remove("active");
                    fetchStatus();
                } else if (res.status === 401 && data.detail === "2FA_PASSWORD_REQUIRED") {
                    // Show 2FA password field with a prompt
                    if (loginPassword) {
                        loginPassword.style.border = "2px solid #f59e0b";
                        loginPassword.placeholder = "⚠️ Your account has 2FA - enter password here";
                        loginPassword.focus();
                    }
                    alert("🔐 Your account has Two-Factor Authentication enabled.\nPlease enter your 2FA password in the field below and click Sign In again.");
                } else {
                    alert("❌ Error: " + (data.detail || "Invalid code"));
                }
            } catch (err) {
                alert("❌ Error: " + err);
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
        if (sendMessageModal) sendMessageModal.classList.add("active");
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
                const res = await apiFetch("/api/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ destination_chat_id: targetId, message: text })
                });
                const data = await res.json();
                if (data.success) {
                    alert("✅ Message sent successfully!");
                    if (sendMessageModal) sendMessageModal.classList.remove("active");
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

    /**
     * Format a date string or Date object to IST (Asia/Kolkata, UTC+5:30).
     * If the string already ends with " IST" (set by the backend), return as-is.
     */
    function formatIST(dateInput) {
        if (!dateInput) return "";
        // Backend already sends "YYYY-MM-DD HH:MM:SS IST" — return as-is
        if (typeof dateInput === "string" && dateInput.endsWith(" IST")) return dateInput;
        try {
            const d = new Date(dateInput);
            if (isNaN(d.getTime())) return dateInput;
            return d.toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false
            }) + " IST";
        } catch (e) {
            return dateInput;
        }
    }

    // --- Init App Data ---
    // Only run if user is authenticated (has token) or Supabase isn't configured
    const initToken = localStorage.getItem("sb_access_token");
    if (initToken) {
        fetchStatus();
        fetchMessages();
        setInterval(fetchMessages, 5000);
    } else {
        // Try fetching status without token to check if supabase is configured
        fetch("/api/status").then(res => {
            if (res.status === 401) {
                window.location.href = "/login";
            } else if (res.ok) {
                fetchStatus();
                fetchMessages();
                setInterval(fetchMessages, 5000);
            }
        }).catch(() => {
            fetchStatus();
            fetchMessages();
            setInterval(fetchMessages, 5000);
        });
    }
});
