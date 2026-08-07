import React, { useState } from "react";
import { authFetch, getApiUrl } from "../api";

export default function PricingTab({ status, onRefresh, showToast }) {
  const currentPlan = status?.subscription?.plan_id || "free";
  const isSubActive = status?.subscription?.status === "active";
  const [loadingPlan, setLoadingPlan] = useState(null);

  const notify = (msg, type = "info") => {
    if (showToast) showToast(msg, type);
  };

  const handleSubscribe = async (planId) => {
    setLoadingPlan(planId);
    console.info("[RAZORPAY] create order request", { plan_id: planId });
    console.info(`[PAYMENT] Requested plan: ${planId}`);

    try {
      // 1. Create fresh order from backend
      const orderRes = await authFetch("/api/subscription/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId })
      });
      const orderData = await orderRes.json();
      console.info("[PAYMENT] Order create response:", orderData);

      if (!orderRes.ok || !orderData.success || !orderData.order_id || !orderData.order_id.startsWith("order_")) {
        console.error("[PAYMENT] Error response:", orderData);
        notify("Payment Order Error: " + (orderData.detail || "Could not initialize payment order."), "error");
        setLoadingPlan(null);
        return;
      }

      const mode = orderData.key_id?.startsWith("rzp_live_") ? "LIVE" : "TEST";
      console.info("[RAZORPAY] order id", orderData.order_id);
      console.info("[RAZORPAY] order amount", orderData.amount);
      console.info(`[PAYMENT] Amount: ${orderData.amount} paise (${orderData.currency})`);
      console.info(`[PAYMENT] Razorpay mode: ${mode}`);
      console.info(`[PAYMENT] Razorpay order_id: ${orderData.order_id}`);

      // 2. Launch fresh Razorpay Checkout modal instance
      const options = {
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Telegram Sync Hub",
        description: orderData.plan_name,
        order_id: orderData.order_id,
        retry: {
          enabled: false // Prevents in-iframe retry on expired QR/order, ensuring retries create a FRESH backend order
        },
        handler: async function (response) {
          console.info("[PAYMENT] Razorpay checkout callback response:", response);
          try {
            const verifyRes = await authFetch("/api/subscription/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                plan_id: planId
              })
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              console.info("[PAYMENT] Signature verification succeeded. Subscription activated:", verifyData);
              notify("🎉 Payment Verified! Plan activated successfully!", "success");
              onRefresh();
            } else {
              console.error("[PAYMENT] Verification failed:", verifyData);
              notify("Payment Verification Error: " + verifyData.detail, "error");
            }
          } catch (e) {
            console.error("[PAYMENT] Verification network error:", e);
            notify("Verification network error: " + e, "error");
          }
        },
        theme: {
          color: "#0088cc"
        }
      };

      console.info("[PAYMENT] Checkout options:", {
        key_id: options.key,
        amount: options.amount,
        currency: options.currency,
        order_id: options.order_id,
        plan: options.description
      });

      if (window.Razorpay) {
        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", function (response) {
          console.error("[RAZORPAY] payment failed", response.error);
          console.error("[RAZORPAY] payment error code", response.error?.code);
          console.error("[RAZORPAY] payment error description", response.error?.description);
          notify(`Payment Failed / Expired: ${response.error?.description || "Please retry to generate a fresh payment QR."}`, "error");
        });
        rzp.open();
        console.info("[RAZORPAY] checkout opened");
      } else {
        console.error("[PAYMENT] Error response: Razorpay Checkout SDK not loaded on window.");
        notify("Razorpay Checkout SDK not loaded.", "warning");
      }
    } catch (err) {
      console.error("[PAYMENT] Subscription Error:", err);
      notify("Subscription Error: " + err, "error");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <section className="tab-content active" id="tab-pricing">
      <div style={{ textAlign: "center", marginBottom: "30px" }}>
        <h2 style={{ fontSize: "28px", fontWeight: "700" }}>Simple, Transparent Pricing</h2>
        <p style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "4px" }}>
          Unlock real-time Telegram message listener, multi-tenant channel sync & n8n webhook automation.
        </p>
      </div>

      <div className="pricing-grid">
        {/* Basic Plan */}
        <div className={`pricing-card ${currentPlan === "plan_599" ? "popular" : ""}`}>
          <div className="pricing-badge" style={{ background: "var(--primary-blue)", color: "#fff" }}>POPULAR</div>
          <h3 style={{ fontSize: "20px", fontWeight: "700" }}>Basic Plan</h3>
          <div className="pricing-price">
            ₹599 <span>/ month</span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            Essential Telegram channel sync & n8n webhook automation for traders and creators.
          </p>

          <ul className="plan-features">
            <li><i className="fa-solid fa-circle-check"></i> 1 Telegram Account Session</li>
            <li><i className="fa-solid fa-circle-check"></i> Unlimited Source Channels</li>
            <li><i className="fa-solid fa-circle-check"></i> Real-Time Text Modifier Engine</li>
            <li><i className="fa-solid fa-circle-check"></i> n8n Webhook Instant Integration</li>
            <li><i className="fa-solid fa-circle-check"></i> 24/7 Automated Sync Loop</li>
          </ul>

          <button
            className={`btn ${currentPlan === "plan_599" && isSubActive ? "btn-success" : "btn-primary"} w-100`}
            disabled={currentPlan === "plan_599" && isSubActive}
            onClick={() => handleSubscribe("plan_599")}
          >
            {loadingPlan === "plan_599" ? (
              <><i className="fa-solid fa-spinner fa-spin"></i> Initializing...</>
            ) : currentPlan === "plan_599" && isSubActive ? (
              <><i className="fa-solid fa-check-circle"></i> ✓ Current Active Plan</>
            ) : (
              <><i className="fa-solid fa-bolt"></i> Subscribe Basic (₹599)</>
            )}
          </button>
        </div>

        {/* Pro Plan */}
        <div className={`pricing-card popular`}>
          <div className="pricing-badge">BEST VALUE</div>
          <h3 style={{ fontSize: "20px", fontWeight: "700" }}>Pro Plan</h3>
          <div className="pricing-price">
            ₹799 <span>/ month</span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            Advanced multi-channel sync with priority routing, bulk replacements & 24/7 support.
          </p>

          <ul className="plan-features">
            <li><i className="fa-solid fa-circle-check"></i> <strong>Everything in Basic +</strong></li>
            <li><i className="fa-solid fa-circle-check"></i> Multi-Destination Channel Routing</li>
            <li><i className="fa-solid fa-circle-check"></i> Advanced Link Overriding & Stripping</li>
            <li><i className="fa-solid fa-circle-check"></i> Bulk Keyword Filtering Rules</li>
            <li><i className="fa-solid fa-circle-check"></i> Priority Telegram Sync Engine</li>
            <li><i className="fa-solid fa-circle-check"></i> VIP Support & Setup Guidance</li>
          </ul>

          <button
            className={`btn ${currentPlan === "plan_799" && isSubActive ? "btn-success" : "btn-primary"} w-100`}
            style={{ background: currentPlan === "plan_799" && isSubActive ? "" : "var(--primary-yellow)", color: "#000" }}
            disabled={currentPlan === "plan_799" && isSubActive}
            onClick={() => handleSubscribe("plan_799")}
          >
            {loadingPlan === "plan_799" ? (
              <><i className="fa-solid fa-spinner fa-spin"></i> Initializing...</>
            ) : currentPlan === "plan_799" && isSubActive ? (
              <><i className="fa-solid fa-check-circle"></i> ✓ Current Active Plan</>
            ) : (
              <><i className="fa-solid fa-crown"></i> Subscribe Pro (₹799)</>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
