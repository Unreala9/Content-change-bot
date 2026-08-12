import React, { useState } from "react";
import { supabase } from "../supabase";

export default function ForgotPasswordModal({ isOpen, onClose }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  if (!isOpen) return null;

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setMessage("");

    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      // Always show neutral confirmation message to prevent email enumeration
      setMessage("If an account exists for this email, a password reset link has been sent.");
    } catch (err) {
      console.error("[AUTH] Reset password request notice:", err);
      setMessage("If an account exists for this email, a password reset link has been sent.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog" style={{ maxWidth: "420px" }}>
        <div className="modal-header">
          <h3 style={{ fontSize: "16px", fontWeight: "700" }}>
            <i className="fa-solid fa-key text-yellow" style={{ marginRight: "8px" }}></i>
            Forgot Password
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {message ? (
            <div style={{ background: "rgba(14, 203, 129, 0.15)", border: "1px solid rgba(14, 203, 129, 0.3)", color: "var(--accent-green)", padding: "12px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>
              {message}
            </div>
          ) : (
            <form onSubmit={handleResetPassword}>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
                Enter your registered email address below. We will send you a secure link to reset your password.
              </p>
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Email Address</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary w-100" style={{ width: "100%", background: "var(--primary-yellow)", color: "#000", fontWeight: "700" }} disabled={loading}>
                {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-paper-plane"></i>} Send Reset Link
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
