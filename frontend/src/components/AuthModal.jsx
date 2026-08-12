import React, { useState, useEffect } from "react";
import { authFetch } from "../api";

export default function AuthModal({ isOpen, onClose, onRefresh, status }) {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState(status?.user?.phone || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (status?.user?.phone) {
      setPhone(status.user.phone);
    }
  }, [status]);

  if (!isOpen) return null;

  const handleSendCode = async (e) => {
    e.preventDefault();
    if (!phone.trim()) return setErrorMsg("Please enter phone number (+91...)");

    setLoading(true);
    setStatusText("Connecting to Telegram & Sending OTP...");
    setErrorMsg("");

    try {
      const res = await authFetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phone })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusText("OTP Sent Successfully!");
        setStep(2);
      } else {
        setErrorMsg(data.detail || data.message || "Failed to send verification code.");
      }
    } catch (err) {
      setErrorMsg(err.message || err.toString());
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (!code.trim()) return setErrorMsg("Please enter verification code");

    setLoading(true);
    setStatusText("Verifying code with Telegram...");
    setErrorMsg("");

    try {
      const res = await authFetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phone, code: code, password: password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusText("Telegram Account Connected!");
        setTimeout(() => {
          onRefresh();
          onClose();
        }, 600);
      } else {
        setErrorMsg(data.detail || data.message || "Invalid verification code.");
      }
    } catch (err) {
      setErrorMsg(err.toString());
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog">
        <div className="modal-header">
          <h3 style={{ fontSize: "16px", fontWeight: "700" }}>
            <i className="fa-paper-plane fa-solid text-blue"></i> Connect Telegram Account
          </h3>
          <button className="modal-close" onClick={onClose} disabled={loading}>&times;</button>
        </div>

        <div className="modal-body">
          {statusText && (
            <div style={{ background: "rgba(59, 130, 246, 0.15)", border: "1px solid rgba(59, 130, 246, 0.3)", color: "#60a5fa", padding: "10px 14px", borderRadius: "8px", fontSize: "12px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
              <i className="fa-solid fa-spinner fa-spin"></i>
              <span>{statusText}</span>
            </div>
          )}

          {errorMsg && (
            <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "var(--accent-red)", padding: "10px 14px", borderRadius: "8px", fontSize: "12px", marginBottom: "14px" }}>
              {errorMsg}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleSendCode}>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
                Enter your Telegram account phone number (with country code, e.g. <code>+919876543210</code>).
              </p>
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Phone Number</label>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="+919876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary w-100" style={{ width: "100%" }} disabled={loading}>
                {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-paper-plane"></i>} Send Verification Code
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode}>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
                Enter the 5-digit login code received in your official Telegram app for <strong>{phone}</strong>.
              </p>
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Telegram Login Code</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="12345"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Two-Step Verification Password (Optional)</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Leave empty if disabled"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <button type="submit" className="btn btn-success w-100" style={{ width: "100%" }} disabled={loading}>
                {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>} Complete Verification & Connect
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
