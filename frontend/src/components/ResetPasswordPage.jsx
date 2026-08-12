import React, { useState } from "react";
import { supabase } from "../supabase";

export default function ResetPasswordPage({ onResetComplete }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ type: "", msg: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) return;

    if (newPassword.length < 6) {
      return setAlert({ type: "error", msg: "Password must be at least 6 characters long." });
    }

    if (newPassword !== confirmPassword) {
      return setAlert({ type: "error", msg: "Passwords do not match. Please try again." });
    }

    setLoading(true);
    setAlert({ type: "", msg: "" });

    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword.trim()
      });

      if (error) {
        setAlert({ type: "error", msg: error.message || "Failed to update password." });
      } else {
        setAlert({ type: "success", msg: "Password updated successfully! Redirecting to dashboard..." });
        setTimeout(() => {
          onResetComplete();
        }, 1500);
      }
    } catch (err) {
      setAlert({ type: "error", msg: "Error updating password: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0e11", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: "420px", background: "rgba(30, 35, 41, 0.85)", border: "1px solid #2b3139", borderRadius: "16px", padding: "36px 32px", backdropFilter: "blur(12px)" }}>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ width: "56px", height: "56px", background: "rgba(252, 213, 53, 0.1)", border: "1px solid rgba(252, 213, 53, 0.3)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "var(--primary-yellow)", fontSize: "24px" }}>
            <i className="fa-solid fa-lock"></i>
          </div>
          <h2 style={{ fontSize: "22px", fontWeight: "700", color: "#ffffff" }}>
            Reset Password
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
            Create a new secure password for your account
          </p>
        </div>

        {alert.msg && (
          <div style={{ padding: "12px", borderRadius: "8px", fontSize: "13px", marginBottom: "20px", background: alert.type === "success" ? "rgba(14, 203, 129, 0.15)" : "rgba(246, 70, 93, 0.15)", border: `1px solid ${alert.type === "success" ? "rgba(14, 203, 129, 0.3)" : "rgba(246, 70, 93, 0.3)"}`, color: alert.type === "success" ? "var(--accent-green)" : "var(--accent-red)" }}>
            {alert.msg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>New Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                className="form-control"
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <i
                className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`}
                style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-muted)" }}
                onClick={() => setShowPassword(!showPassword)}
              />
            </div>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Confirm New Password</label>
            <input
              type={showPassword ? "text" : "password"}
              className="form-control"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-100"
            style={{ width: "100%", padding: "12px", background: "var(--primary-yellow)", color: "#000", fontWeight: "700" }}
            disabled={loading}
          >
            {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check-double"></i>}
            {" "}Update Password
          </button>
        </form>
      </div>
    </div>
  );
}
