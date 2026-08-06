document.addEventListener("DOMContentLoaded", () => {
    // --- Application State ---
    const state = {
        connected: false,
        authorized: false,
        user: null,
        account: null,
        activeTab: "tab-studio",
        channels: [],
        activeChannelFilter: "all",
        searchQuery: "",
        messages: [],
        sourceHistory: [],
        destHistory: [],
        replacementRules: [], // Array of {find: "", replace: ""}
        edge_function_url: ""
    };

    // --- Helper: Dynamic API URL Formatter ---
    function getApiUrl(path) {
        const baseUrl = (window.ENV && window.ENV.API_BASE_URL) ? window.ENV.API_BASE_URL.replace(/\/+$/, "") : "";
        if (path.startsWith("http://") || path.startsWith("https://")) {
            return path;
        }
        return baseUrl + (path.startsWith("/") ? path : "/" + path);
    }

    // --- Toast & Custom Modal Notification Systems ---
    function showToast(title, message, type = "info", duration = 4000) {
        const container = document.getElementById("toastContainer");
        if (!container) return;

        const iconMap = {
            success: "fa-circle-check",
            error: "fa-triangle-exclamation",
            warning: "fa-triangle-exclamation",
            lock: "fa-lock",
            info: "fa-circle-info"
        };

        const toast = document.createElement("div");
        toast.className = `toast-notification ${type}`;
        toast.innerHTML = `
            <div class="toast-icon"><i class="fa-solid ${iconMap[type] || 'fa-bell'}"></i></div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close">&times;</button>
        `;

        const closeBtn = toast.querySelector(".toast-close");
        closeBtn.addEventListener("click", () => {
            toast.style.animation = "toastFadeOut 0.3s ease forwards";
            setTimeout(() => toast.remove(), 300);
        });

        container.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = "toastFadeOut 0.3s ease forwards";
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }

    function showCustomModal({ title, message, icon = "fa-crown", type = "warning", confirmText = "OK", cancelText = null, onConfirm = null }) {
        const backdrop = document.getElementById("customModalBackdrop");
        if (!backdrop) {
            alert(`${title}\n\n${message}`);
            if (onConfirm) onConfirm();
            return;
        }

        const titleEl = document.getElementById("customModalTitle");
        const messageEl = document.getElementById("customModalMessage");
        const iconEl = document.getElementById("customModalIcon");
        const actionsEl = document.getElementById("customModalActions");

        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.textContent = message;
        if (iconEl) iconEl.innerHTML = `<i class="fa-solid ${icon}"></i>`;

        if (iconEl) {
            if (type === "warning" || type === "lock") {
                iconEl.style.background = "rgba(252,213,53,0.15)";
                iconEl.style.color = "#fcd535";
                iconEl.style.border = "1px solid rgba(252,213,53,0.3)";
            } else if (type === "error") {
                iconEl.style.background = "rgba(246,70,93,0.15)";
                iconEl.style.color = "#f6465d";
                iconEl.style.border = "1px solid rgba(246,70,93,0.3)";
            } else {
                iconEl.style.background = "rgba(14,203,129,0.15)";
                iconEl.style.color = "#0ecb81";
                iconEl.style.border = "1px solid rgba(14,203,129,0.3)";
            }
        }

        let buttonsHtml = `<button class="btn btn-primary" id="customModalConfirmBtn" style="padding: 10px 24px; border-radius: 8px;">${confirmText}</button>`;
        if (cancelText) {
            buttonsHtml = `<button class="btn btn-outline" id="customModalCancelBtn" style="padding: 10px 20px; border-radius: 8px;">${cancelText}</button>` + buttonsHtml;
        }
        if (actionsEl) actionsEl.innerHTML = buttonsHtml;

        const confirmBtn = document.getElementById("customModalConfirmBtn");
        const cancelBtn = document.getElementById("customModalCancelBtn");

        const closeFunc = () => {
            backdrop.classList.remove("active");
            setTimeout(() => { backdrop.style.display = "none"; }, 250);
        };

        if (confirmBtn) {
            confirmBtn.onclick = () => {
                closeFunc();
                if (onConfirm) onConfirm();
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = closeFunc;
        }

        backdrop.style.display = "flex";
        setTimeout(() => backdrop.classList.add("active"), 10);
    }

    // --- DOM Elements Cache ---
    const navButtons = document.querySelectorAll(".nav-btn");
    const tabContents = document.querySelectorAll(".tab-content");
    const pageTitle = document.getElementById("pageTitle");
    const pageSubtitle = document.getElementById("pageSubtitle");
    
    // Status Badges & Buttons
    const accountStatusBadge = document.getElementById("accountStatusBadge");
    const accountTitleText = document.getElementById("accountTitleText");
    const accountSubText = document.getElementById("accountSubText");
    const headerConnectionBadge = document.getElementById("headerConnectionBadge");
    const headerSubscriptionBadge = document.getElementById("headerSubscriptionBadge");
    const headerSubBadgeText = document.getElementById("headerSubBadgeText");
    const telegramAuthBadge = document.getElementById("telegramAuthBadge");
    const telegramAuthBody = document.getElementById("telegramAuthBody");
    const telegramAuthBanner = document.getElementById("telegramAuthBanner");
    const userProfilePill = document.getElementById("userProfilePill");
    const userEmailSpan = document.getElementById("userEmailSpan");
    const btnLogoutUser = document.getElementById("btnLogoutUser");

    // Studio Selectors & Forms
    const selectSourceChannel = document.getElementById("selectSourceChannel");
    const selectDestChannel = document.getElementById("selectDestChannel");
    const sourceChatFeed = document.getElementById("sourceChatFeed");
    const destChatFeed = document.getElementById("destChatFeed");
    const rulesContainerStudio = document.getElementById("rulesContainerStudio");
    const btnAddRuleRowStudio = document.getElementById("btnAddRuleRowStudio");
    const btnSaveRulesStudio = document.getElementById("btnSaveRulesStudio");

    // Form inputs studio
    const checkAutoPostTelegramStudio = document.getElementById("checkAutoPostTelegramStudio");
    const checkAutoPostN8nStudio = document.getElementById("checkAutoPostN8nStudio");
    const webhookUrlStudio = document.getElementById("webhookUrlStudio");
    const textPrefixStudio = document.getElementById("textPrefixStudio");
    const textSuffixStudio = document.getElementById("textSuffixStudio");
    const findTextStudio = document.getElementById("findTextStudio");
    const replaceTextStudio = document.getElementById("replaceTextStudio");
    const checkOverrideLinksStudio = document.getElementById("checkOverrideLinksStudio");
    const customLinkUrlStudio = document.getElementById("customLinkUrlStudio");
    const checkRemoveLinksStudio = document.getElementById("checkRemoveLinksStudio");
    const filterModeStudio = document.getElementById("filterModeStudio");
    const keywordFilterStudio = document.getElementById("keywordFilterStudio");

    // Settings Tab Inputs
    const syncSettingsForm = document.getElementById("syncSettingsForm");
    const webhookUrlInput = document.getElementById("webhookUrl");
    const textPrefixInput = document.getElementById("textPrefix");
    const textSuffixInput = document.getElementById("textSuffix");
    const findTextInput = document.getElementById("findText");
    const replaceTextInput = document.getElementById("replaceText");

    // Overview Stats
    const statReceived = document.getElementById("statReceived");
    const statForwarded = document.getElementById("statForwarded");
    const statFiltered = document.getElementById("statFiltered");
    const statEngineStatus = document.getElementById("statEngineStatus");
    const activeWebhookUrlText = document.getElementById("activeWebhookUrlText");
    const overviewRecentTable = document.getElementById("overviewRecentTable");
    const fullLogsTable = document.getElementById("fullLogsTable");
    const overviewSubStatCard = document.getElementById("overviewSubStatCard");
    const overviewPlanTitle = document.getElementById("overviewPlanTitle");
    const overviewPlanSubText = document.getElementById("overviewPlanSubText");

    // Channels Grid & Filters
    const channelSearchInput = document.getElementById("channelSearchInput");
    const btnFetchChannels = document.getElementById("btnFetchChannels");
    const filterPills = document.querySelectorAll(".filter-pill");
    const channelsGridContainer = document.getElementById("channelsGridContainer");

    // Buttons & Modals
    const btnConnectTelegramHeader = document.getElementById("btnConnectTelegramHeader");
    const btnConnectTelegramBanner = document.getElementById("btnConnectTelegramBanner");
    const btnOpenLoginModal = document.getElementById("btnOpenLoginModal");
    const btnRefreshStatus = document.getElementById("btnRefreshStatus");
    const btnRefreshLogs = document.getElementById("btnRefreshLogs");
    const btnGoToSettings = document.getElementById("btnGoToSettings");
    const btnDisconnectTelegram = document.getElementById("btnDisconnectTelegram");

    // Modal elements
    const loginModal = document.getElementById("loginModal");
    const btnCloseLoginModal = document.getElementById("btnCloseLoginModal");
    const loginPhoneNumber = document.getElementById("loginPhoneNumber");
    const btnSendPhoneCode = document.getElementById("btnSendPhoneCode");
    const loginStep1 = document.getElementById("loginStep1");
    const loginStep2 = document.getElementById("loginStep2");
    const loginCode = document.getElementById("loginCode");
    const loginPassword = document.getElementById("loginPassword");
    const btnVerifyCode = document.getElementById("btnVerifyCode");

    const sendMessageModal = document.getElementById("sendMessageModal");
    const btnCloseSendModal = document.getElementById("btnCloseSendModal");
    const sendMessageForm = document.getElementById("sendMessageForm");
    const sendDestinationChat = document.getElementById("sendDestinationChat");
    const sendDestinationId = document.getElementById("sendDestinationId");
    const sendMessageText = document.getElementById("sendMessageText");

    // --- Helper: Authenticated Fetch Request ---
    async function authFetch(url, options = {}) {
        const fullUrl = getApiUrl(url);
        options.headers = options.headers || {};
        const token = localStorage.getItem("sb_access_token");
        if (token) {
            options.headers["Authorization"] = `Bearer ${token}`;
        }
        return fetch(fullUrl, options);
    }

    // --- Helper: Escape HTML string safely ---
    function escapeHtml(text) {
        if (!text) return "";
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // --- Tab Navigation Logic ---
    const tabTitles = {
        "tab-studio": { title: "Side-by-Side Sync Studio", sub: "Source Channel Extract &rarr; Live Modifier Engine &rarr; Destination Channel Paste" },
        "tab-overview": { title: "Dashboard Overview & Stats", sub: "Real-time Telegram message listener & n8n webhook automation" },
        "tab-channels": { title: "Dialogs & Channels Matrix", sub: "Inspect, search and manage all accessible Telegram channels and chats" },
        "tab-settings": { title: "n8n & Rules Engine Config", sub: "Configure global transformation rules, replacements, and webhook targets" },
        "tab-logs": { title: "Live Sync Feed", sub: "Real-time feed of intercepted and transformed Telegram messages" },
        "tab-pricing": { title: "Pricing & Subscription Plans", sub: "Select a plan to enable real-time Telegram channel syncing" }
    };

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");
            
            navButtons.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));

            btn.classList.add("active");
            const targetEl = document.getElementById(targetTab);
            if (targetEl) targetEl.classList.add("active");

            if (tabTitles[targetTab]) {
                pageTitle.innerHTML = tabTitles[targetTab].title;
                pageSubtitle.innerHTML = tabTitles[targetTab].sub;
            }

            state.activeTab = targetTab;

            if (targetTab === "tab-channels" && state.channels.length === 0) {
                fetchChannels();
            }
        });
    });

    if (btnGoToSettings) {
        btnGoToSettings.addEventListener("click", () => {
            const settingsTabBtn = document.querySelector('.nav-btn[data-tab="tab-settings"]');
            if (settingsTabBtn) settingsTabBtn.click();
        });
    }

    if (headerSubscriptionBadge) {
        headerSubscriptionBadge.addEventListener("click", () => {
            const pricingTabBtn = document.querySelector('.nav-btn[data-tab="tab-pricing"]');
            if (pricingTabBtn) pricingTabBtn.click();
        });
    }

    if (overviewSubStatCard) {
        overviewSubStatCard.addEventListener("click", () => {
            const pricingTabBtn = document.querySelector('.nav-btn[data-tab="tab-pricing"]');
            if (pricingTabBtn) pricingTabBtn.click();
        });
    }

    // --- Multi-Rules UI Engine ---
    function renderRulesStack(rulesArray) {
        if (!rulesContainerStudio) return;
        rulesContainerStudio.innerHTML = "";

        if (!rulesArray || rulesArray.length === 0) {
            return;
        }

        rulesArray.forEach((rule, idx) => {
            const row = document.createElement("div");
            row.className = "rule-row";
            row.innerHTML = `
                <input type="text" class="form-control rule-find" placeholder="Find text..." value="${escapeHtml(rule.find)}">
                <i class="fa-solid fa-arrow-right text-muted" style="font-size: 11px;"></i>
                <input type="text" class="form-control rule-replace" placeholder="Replace with..." value="${escapeHtml(rule.replace)}">
                <button type="button" class="btn-remove-rule" data-index="${idx}" title="Remove Rule"><i class="fa-solid fa-trash-can"></i></button>
            `;
            rulesContainerStudio.appendChild(row);
        });

        rulesContainerStudio.querySelectorAll(".btn-remove-rule").forEach(btn => {
            btn.addEventListener("click", () => {
                const index = parseInt(btn.getAttribute("data-index"), 10);
                state.replacementRules.splice(index, 1);
                renderRulesStack(state.replacementRules);
            });
        });
    }

    if (btnAddRuleRowStudio) {
        btnAddRuleRowStudio.addEventListener("click", () => {
            state.replacementRules.push({ find: "", replace: "" });
            renderRulesStack(state.replacementRules);
        });
    }

    function collectRulesFromUI() {
        const rules = [];
        if (!rulesContainerStudio) return rules;
        const rows = rulesContainerStudio.querySelectorAll(".rule-row");
        rows.forEach(row => {
            const findVal = row.querySelector(".rule-find").value.trim();
            const replaceVal = row.querySelector(".rule-replace").value;
            if (findVal) {
                rules.push({ find: findVal, replace: replaceVal });
            }
        });
        return rules;
    }

    // --- Status & State Synchronization ---
    async function fetchStatus() {
        try {
            const res = await authFetch("/api/status");
            const data = await res.json();
            updateStatusUI(data);
        } catch (err) {
            console.error("Error fetching engine status:", err);
        }
    }

    function updateStatusUI(data) {
        state.connected = data.connected;
        state.authorized = data.authorized;
        state.user = data.user;
        state.account = data.account;

        if (data.edge_function_url) {
            state.edge_function_url = data.edge_function_url;
        }
        if (data.razorpay_key_id) {
            state.razorpay_key_id = data.razorpay_key_id;
        }

        // Subscription Handling
        if (data.subscription) {
            state.subscription = data.subscription;
            const subPlan = data.subscription.plan_id || "free";
            const subName = data.subscription.plan_name || "Free Tier";
            const isSubActive = data.subscription.status === "active";

            if (headerSubBadgeText) headerSubBadgeText.textContent = subName;
            if (overviewPlanTitle) overviewPlanTitle.textContent = subName;
            if (overviewPlanSubText) overviewPlanSubText.textContent = isSubActive && subPlan !== "free" ? "✓ Subscription Active" : "Click to upgrade plan";

            // Update pricing buttons state
            document.querySelectorAll(".btn-subscribe-plan").forEach(btn => {
                const planId = btn.getAttribute("data-plan");
                if (subPlan === planId && isSubActive) {
                    btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> ✓ Current Active Plan';
                    btn.classList.add("btn-success");
                    btn.classList.remove("btn-primary");
                    btn.disabled = true;
                } else {
                    btn.disabled = false;
                    btn.classList.remove("btn-success");
                    btn.classList.add("btn-primary");
                    if (planId === "plan_599") btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Subscribe Basic (₹599)';
                    if (planId === "plan_799") btn.innerHTML = '<i class="fa-solid fa-crown"></i> Subscribe Pro (₹799)';
                }
            });
        }

        // Handle User Profile Pill
        if (data.account && !data.account.is_local) {
            if (userProfilePill) userProfilePill.classList.remove("hidden");
            if (userEmailSpan) userEmailSpan.textContent = data.account.email;
        } else {
            if (userProfilePill) userProfilePill.classList.add("hidden");
        }

        // Telegram Auth Status
        if (data.authorized) {
            if (accountStatusBadge) {
                accountStatusBadge.querySelector(".status-indicator").className = "status-indicator online";
                accountTitleText.textContent = data.user ? `${data.user.first_name} (@${data.user.username || 'user'})` : "Connected to Telegram";
                accountSubText.textContent = "Multi-Tenant Session Active";
            }
            if (headerConnectionBadge) {
                headerConnectionBadge.className = "connection-badge status-online";
                headerConnectionBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>Telegram Connected</span>';
            }
            if (telegramAuthBadge) {
                telegramAuthBadge.className = "badge badge-success";
                telegramAuthBadge.textContent = "Connected";
            }
            if (telegramAuthBanner) telegramAuthBanner.classList.add("hidden");
            
            if (telegramAuthBody) {
                telegramAuthBody.innerHTML = `
                    <div class="avatar-box big mb-10"><i class="fa-solid fa-user-check text-success"></i></div>
                    <h4>${escapeHtml(data.user ? data.user.first_name : 'Telegram Account')}</h4>
                    <p class="text-muted font-12">User ID: ${data.user ? data.user.id : '--'} | Phone: ${data.user ? data.user.phone : '--'}</p>
                    <button class="btn btn-outline btn-sm text-danger mt-15" id="btnDisconnectTelegram">
                        <i class="fa-solid fa-plug-circle-xmark"></i> Disconnect Telegram Account
                    </button>
                `;
                const btnDisc = document.getElementById("btnDisconnectTelegram");
                if (btnDisc) btnDisc.addEventListener("click", disconnectTelegramAccount);
            }
        } else {
            if (accountStatusBadge) {
                accountStatusBadge.querySelector(".status-indicator").className = "status-indicator offline";
                accountTitleText.textContent = "Disconnected / Not Signed In";
                accountSubText.textContent = "Action required";
            }
            if (headerConnectionBadge) {
                headerConnectionBadge.className = "connection-badge status-offline";
                headerConnectionBadge.innerHTML = '<i class="fa-solid fa-plug-circle-xmark"></i> <span>Offline / Connect Telegram</span>';
            }
            if (telegramAuthBadge) {
                telegramAuthBadge.className = "badge badge-outline";
                telegramAuthBadge.textContent = "Signed Out";
            }
            if (telegramAuthBanner) telegramAuthBanner.classList.remove("hidden");

            if (telegramAuthBody) {
                telegramAuthBody.innerHTML = `
                    <div class="avatar-box big mb-10"><i class="fa-solid fa-question"></i></div>
                    <h4>Not Signed In</h4>
                    <p class="text-muted">Click button below to connect Telegram</p>
                    <button class="btn btn-primary mt-15" id="btnOpenLoginModal">
                        <i class="fa-solid fa-key"></i> Authenticate Account
                    </button>
                `;
                const btnOpen = document.getElementById("btnOpenLoginModal");
                if (btnOpen) btnOpen.addEventListener("click", openLogin);
            }
        }

        // Stats Counter Update
        if (data.stats) {
            if (statReceived) statReceived.textContent = data.stats.received || 0;
            if (statForwarded) statForwarded.textContent = data.stats.forwarded || 0;
            if (statFiltered) statFiltered.textContent = data.stats.filtered || 0;
        }

        // Settings Form Sync
        if (data.settings) {
            const s = data.settings;
            if (webhookUrlInput) webhookUrlInput.value = s.webhook_url || "";
            if (webhookUrlStudio) webhookUrlStudio.value = s.webhook_url || "";
            if (activeWebhookUrlText) activeWebhookUrlText.textContent = s.webhook_url || "Not Configured";

            if (textPrefixInput) textPrefixInput.value = s.text_prefix || "";
            if (textPrefixStudio) textPrefixStudio.value = s.text_prefix || "";

            if (textSuffixInput) textSuffixInput.value = s.text_suffix || "";
            if (textSuffixStudio) textSuffixStudio.value = s.text_suffix || "";

            if (findTextInput) findTextInput.value = s.find_text || "";
            if (findTextStudio) findTextStudio.value = s.find_text || "";

            if (replaceTextInput) replaceTextInput.value = s.replace_text || "";
            if (replaceTextStudio) replaceTextStudio.value = s.replace_text || "";

            if (checkAutoPostTelegramStudio) checkAutoPostTelegramStudio.checked = s.auto_post_telegram ?? true;
            if (checkAutoPostN8nStudio) checkAutoPostN8nStudio.checked = s.auto_post_n8n ?? true;

            if (checkOverrideLinksStudio) checkOverrideLinksStudio.checked = s.override_all_links ?? false;
            if (customLinkUrlStudio) {
                customLinkUrlStudio.value = s.custom_link_url || "";
                customLinkUrlStudio.disabled = !s.override_all_links;
            }

            if (checkRemoveLinksStudio) checkRemoveLinksStudio.checked = s.remove_all_links ?? false;
            if (filterModeStudio) filterModeStudio.value = s.filter_mode || "all";
            if (keywordFilterStudio) keywordFilterStudio.value = s.keyword_filter || "";

            if (s.replacement_rules && Array.isArray(s.replacement_rules)) {
                state.replacementRules = s.replacement_rules;
                renderRulesStack(state.replacementRules);
            }
        }
    }

    if (btnLogoutUser) {
        btnLogoutUser.addEventListener("click", () => {
            localStorage.removeItem("sb_access_token");
            window.location.href = "login.html";
        });
    }

    // Toggle Override Links Input State
    if (checkOverrideLinksStudio) {
        checkOverrideLinksStudio.addEventListener("change", (e) => {
            if (customLinkUrlStudio) customLinkUrlStudio.disabled = !e.target.checked;
        });
    }

    // --- Save Settings / Multi-Rules ---
    async function saveSettings(e) {
        if (e) e.preventDefault();
        
        const currentRules = collectRulesFromUI();

        const payload = {
            webhook_url: webhookUrlStudio ? webhookUrlStudio.value.trim() : (webhookUrlInput ? webhookUrlInput.value.trim() : ""),
            source_channel_id: selectSourceChannel ? selectSourceChannel.value : "all",
            destination_channel_id: selectDestChannel ? selectDestChannel.value : "",
            auto_post_telegram: checkAutoPostTelegramStudio ? checkAutoPostTelegramStudio.checked : true,
            auto_post_n8n: checkAutoPostN8nStudio ? checkAutoPostN8nStudio.checked : true,
            text_prefix: textPrefixStudio ? textPrefixStudio.value : (textPrefixInput ? textPrefixInput.value : ""),
            text_suffix: textSuffixStudio ? textSuffixStudio.value : (textSuffixInput ? textSuffixInput.value : ""),
            find_text: findTextStudio ? findTextStudio.value : (findTextInput ? findTextInput.value : ""),
            replace_text: replaceTextStudio ? replaceTextStudio.value : (replaceTextInput ? replaceTextInput.value : ""),
            replacement_rules: currentRules,
            override_all_links: checkOverrideLinksStudio ? checkOverrideLinksStudio.checked : false,
            custom_link_url: customLinkUrlStudio ? customLinkUrlStudio.value.trim() : "",
            remove_all_links: checkRemoveLinksStudio ? checkRemoveLinksStudio.checked : false,
            keyword_filter: keywordFilterStudio ? keywordFilterStudio.value.trim() : "",
            filter_mode: filterModeStudio ? filterModeStudio.value : "all",
            enabled: true
        };

        try {
            const res = await authFetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                showToast("Rules Saved", "✅ Transformation rules & engine settings saved!", "success");
                fetchStatus();
            } else {
                showToast("Save Error", data.detail || "Failed to save settings.", "error");
            }
        } catch (err) {
            showToast("Error", "Error saving settings: " + err, "error");
        }
    }

    if (btnSaveRulesStudio) btnSaveRulesStudio.addEventListener("click", saveSettings);
    if (syncSettingsForm) syncSettingsForm.addEventListener("submit", saveSettings);

    // --- Channels Fetching & Dynamic Matrix ---
    async function fetchChannels() {
        try {
            const res = await authFetch("/api/channels");
            const data = await res.json();
            if (data.success) {
                state.channels = data.channels || [];
                renderChannelSelectors(state.channels);
                renderChannelsGrid();
            }
        } catch (err) {
            console.error("Error fetching Telegram channels:", err);
        }
    }

    function renderChannelSelectors(channels) {
        if (selectSourceChannel) {
            const currentSource = selectSourceChannel.value;
            let sourceHtml = '<option value="all">&⚡ All Incoming Chats (Global Extract)</option>';
            channels.forEach(ch => {
                sourceHtml += `<option value="${ch.id}">${escapeHtml(ch.name)} (ID: ${ch.id})</option>`;
            });
            selectSourceChannel.innerHTML = sourceHtml;
            selectSourceChannel.value = currentSource || "all";
        }

        if (selectDestChannel) {
            const currentDest = selectDestChannel.value;
            let destHtml = '<option value="">-- Select Destination Channel --</option>';
            channels.forEach(ch => {
                destHtml += `<option value="${ch.id}">${escapeHtml(ch.name)} (ID: ${ch.id})</option>`;
            });
            selectDestChannel.innerHTML = destHtml;
            selectDestChannel.value = currentDest || "";
        }
    }

    function renderChannelsGrid() {
        if (!channelsGridContainer) return;

        let filtered = state.channels;

        if (state.activeChannelFilter !== "all") {
            filtered = filtered.filter(c => c.type.toLowerCase() === state.activeChannelFilter);
        }

        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            filtered = filtered.filter(c => c.name.toLowerCase().includes(q) || String(c.id).includes(q));
        }

        if (filtered.length === 0) {
            channelsGridContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-comments font-24"></i>
                    <p>No Telegram dialogs found matching your filter.</p>
                </div>
            `;
            return;
        }

        channelsGridContainer.innerHTML = filtered.map(chat => {
            let iconClass = "fa-bullhorn text-blue";
            if (chat.type === "group") iconClass = "fa-users text-purple";
            if (chat.type === "user") iconClass = "fa-user text-green";

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
            const res = await authFetch("/api/messages");
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

    function renderSourceChatFeed(feedItems) {
        if (!sourceChatFeed) return;
        if (!feedItems || feedItems.length === 0) {
            sourceChatFeed.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-comments"></i>
                    <p>No messages found in source channel.</p>
                </div>
            `;
            return;
        }

        sourceChatFeed.innerHTML = feedItems.slice(0, 10).map(item => `
            <div class="stream-card">
                <div class="stream-card-header">
                    <span><i class="fa-solid fa-user-circle"></i> ${escapeHtml(item.sender_name)}</span>
                    <span>${item.date}</span>
                </div>
                <div class="stream-card-body">${escapeHtml(item.text)}</div>
            </div>
        `).join("");
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
    const openLogin = () => {
        // Check if user has an active paid subscription (Basic ₹599 or Pro ₹799)
        const hasPaidSub = state.subscription && state.subscription.status === "active" &&
                           (state.subscription.plan_id === "plan_599" || state.subscription.plan_id === "plan_799");

        if (!hasPaidSub) {
            showCustomModal({
                title: "Active Subscription Required",
                message: "An active paid subscription (Basic Plan ₹599 or Pro Plan ₹799) is required to connect your Telegram account. Click Subscribe below to launch Razorpay checkout immediately.",
                icon: "fa-lock",
                type: "lock",
                confirmText: "⚡ Subscribe Basic (₹599)",
                cancelText: "Cancel",
                onConfirm: () => {
                    const btn = document.getElementById("btnSubscribe599");
                    startRazorpayCheckout("plan_599", btn);
                }
            });
            return;
        }

        if (loginModal) loginModal.classList.add("active");
    };

    if (btnOpenLoginModal) btnOpenLoginModal.addEventListener("click", openLogin);
    if (btnConnectTelegramHeader) btnConnectTelegramHeader.addEventListener("click", openLogin);
    if (btnConnectTelegramBanner) btnConnectTelegramBanner.addEventListener("click", openLogin);
    if (headerConnectionBadge) {
        headerConnectionBadge.addEventListener("click", () => {
            if (!state.authorized) openLogin();
        });
    }

    if (btnCloseLoginModal) btnCloseLoginModal.addEventListener("click", () => loginModal.classList.remove("active"));
    if (btnCloseSendModal) btnCloseSendModal.addEventListener("click", () => sendMessageModal.classList.remove("active"));

    // Send Phone Code
    if (btnSendPhoneCode) {
        btnSendPhoneCode.addEventListener("click", async () => {
            const phone = loginPhoneNumber.value.trim();
            if (!phone) return showToast("Input Error", "Please enter your phone number (+91...)", "warning");

            btnSendPhoneCode.disabled = true;
            btnSendPhoneCode.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

            try {
                const res = await authFetch("/api/auth/send-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phone_number: phone })
                });
                const data = await res.json();
                if (data.success) {
                    showToast("Code Sent!", "Verification code sent to your Telegram app.", "success");
                    loginStep1.classList.add("hidden");
                    loginStep2.classList.remove("hidden");
                } else {
                    showToast("Failed to Send Code", data.detail || "Invalid phone number or subscription issue.", "error");
                }
            } catch (err) {
                showToast("Error", err.toString(), "error");
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

            if (!code) return showToast("Input Error", "Please enter verification code", "warning");

            btnVerifyCode.disabled = true;
            btnVerifyCode.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';

            try {
                const res = await authFetch("/api/auth/verify-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phone_number: phone, code: code, password: pwd })
                });
                const data = await res.json();
                if (data.success) {
                    showToast("Success", "🎉 Telegram account connected successfully!", "success");
                    loginModal.classList.remove("active");
                    fetchStatus();
                } else {
                    showToast("Authentication Failed", data.detail || "Invalid verification code.", "error");
                }
            } catch (err) {
                showToast("Error", err.toString(), "error");
            } finally {
                btnVerifyCode.disabled = false;
                btnVerifyCode.innerHTML = '<i class="fa-solid fa-check"></i> Sign In';
            }
        });
    }

    // Disconnect Telegram Account Handler
    function disconnectTelegramAccount() {
        showCustomModal({
            title: "Disconnect Telegram Account",
            message: "Are you sure you want to disconnect your Telegram account from Telegram Sync Hub?",
            icon: "fa-plug-circle-xmark",
            type: "error",
            confirmText: "Disconnect",
            cancelText: "Keep Connected",
            onConfirm: async () => {
                const btnDisconnectTelegram = document.getElementById("btnDisconnectTelegram");
                if (btnDisconnectTelegram) {
                    btnDisconnectTelegram.disabled = true;
                    btnDisconnectTelegram.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Disconnecting...';
                }

                try {
                    const res = await authFetch("/api/auth/logout-telegram", {
                        method: "POST"
                    });
                    const data = await res.json();
                    if (data.success) {
                        showToast("Disconnected", "✅ Telegram account disconnected successfully!", "success");
                        state.channels = [];
                        fetchStatus();
                    } else {
                        showToast("Error", data.detail || "Failed to disconnect account.", "error");
                    }
                } catch (err) {
                    showToast("Error", err.toString(), "error");
                }
            }
        });
    }

    // --- Send Message Modal Handlers ---
    function openSendMessageModal(chatId, chatName) {
        if (sendDestinationChat) sendDestinationChat.value = chatName;
        if (sendDestinationId) sendDestinationId.value = chatId;
        if (sendMessageText) sendMessageText.value = "";
        if (sendMessageModal) sendMessageModal.classList.add("active");
    }

    if (sendMessageForm) {
        sendMessageForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const chatId = sendDestinationId.value;
            const text = sendMessageText.value.trim();

            if (!chatId || !text) return;

            const btnSubmit = document.getElementById("btnSubmitSend");
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

            try {
                const res = await authFetch("/api/send-message", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: chatId, text: text })
                });
                const data = await res.json();
                if (data.success) {
                    showToast("Message Sent!", "✅ Message sent successfully!", "success");
                    sendMessageModal.classList.remove("active");
                    fetchMessages();
                } else {
                    showToast("Error", data.detail || "Failed to send message", "error");
                }
            } catch (err) {
                showToast("Error", err.toString(), "error");
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Message';
            }
        });
    }

    // --- Razorpay Subscription & Payment Handlers ---
    document.querySelectorAll(".btn-subscribe-plan").forEach(btn => {
        btn.addEventListener("click", () => {
            const planId = btn.getAttribute("data-plan");
            startRazorpayCheckout(planId, btn);
        });
    });

    async function startRazorpayCheckout(planId, btnElement) {
        if (!btnElement) return;

        if (state.subscription && state.subscription.status === "active" && state.subscription.plan_id === planId) {
            showToast("Active Plan", "You already have an active subscription for this plan!", "info");
            return;
        }

        const originalText = btnElement.innerHTML;
        btnElement.disabled = true;
        btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Initializing Payment...';

        try {
            let orderRes;
            const edgeUrl = state.edge_function_url || "";
            if (edgeUrl) {
                orderRes = await authFetch(`${edgeUrl}/create-razorpay-order`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ plan_id: planId })
                });
            } else {
                orderRes = await authFetch("/api/subscription/create-order", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ plan_id: planId })
                });
            }

            const orderData = await orderRes.json();

            if (!orderRes.ok || !orderData.success) {
                showToast("Order Error", orderData.detail || orderData.error || "Could not initialize Razorpay order.", "error");
                btnElement.disabled = false;
                btnElement.innerHTML = originalText;
                return;
            }

            if (typeof Razorpay === "undefined") {
                showToast("SDK Error", "Razorpay SDK script failed to load. Please check your internet connection.", "error");
                btnElement.disabled = false;
                btnElement.innerHTML = originalText;
                return;
            }

            const options = {
                key: orderData.key_id,
                amount: orderData.amount,
                currency: orderData.currency || "INR",
                name: "Telegram Sync Hub",
                description: `Subscription: ${orderData.plan_name}`,
                order_id: orderData.order_id,
                handler: async function (response) {
                    const activeUserId = (state.account && state.account.id) ? state.account.id : (state.user ? state.user.id : "");
                    verifyRazorpayPayment({
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_signature: response.razorpay_signature,
                        plan_id: planId,
                        user_id: activeUserId
                    }, btnElement, originalText);
                },
                prefill: {
                    email: (state.user && state.user.email) ? state.user.email : ""
                },
                theme: {
                    color: "#fcd535"
                },
                modal: {
                    ondismiss: function () {
                        btnElement.disabled = false;
                        btnElement.innerHTML = originalText;
                    }
                }
            };

            const rzp = new Razorpay(options);
            rzp.open();

        } catch (err) {
            showToast("Checkout Error", err.toString(), "error");
            btnElement.disabled = false;
            btnElement.innerHTML = originalText;
        }
    }

    async function verifyRazorpayPayment(payload, btnElement, originalText) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying Payment...';

        try {
            let verifyRes;
            const edgeUrl = state.edge_function_url || "";
            if (edgeUrl) {
                verifyRes = await authFetch(`${edgeUrl}/verify-razorpay-payment`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            } else {
                verifyRes = await authFetch("/api/subscription/verify-payment", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            }

            const verifyData = await verifyRes.json();

            if (verifyRes.ok && verifyData.success) {
                showToast("Payment Verified!", verifyData.message || "🎉 Subscription activated successfully.", "success", 6000);
                
                if (verifyData.subscription) {
                    state.subscription = verifyData.subscription;
                    updateStatusUI({
                        connected: state.connected,
                        authorized: state.authorized,
                        user: state.user,
                        account: state.account,
                        stats: {},
                        settings: state.settings,
                        subscription: verifyData.subscription,
                        razorpay_key_id: state.razorpay_key_id,
                        edge_function_url: state.edge_function_url,
                        supabase_configured: true
                    });
                }
                
                fetchStatus();
            } else {
                showToast("Verification Failed", verifyData.detail || verifyData.error || "Payment signature mismatch.", "error");
            }
        } catch (err) {
            showToast("Verification Error", err.toString(), "error");
        } finally {
            if (btnElement) {
                btnElement.disabled = false;
                btnElement.innerHTML = originalText;
            }
        }
    }

    // --- Initial Kickoff ---
    fetchStatus();
    setInterval(fetchStatus, 5000);
    setInterval(fetchMessages, 4000);
});
