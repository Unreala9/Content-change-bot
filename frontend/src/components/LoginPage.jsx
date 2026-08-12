import React, { useState } from "react";
import { getApiUrl } from "../api";
import { supabase } from "../supabase";
import ForgotPasswordModal from "./ForgotPasswordModal";

export default function LoginPage({ onLoginSuccess }) {
  const [authMode, setAuthMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ type: "", msg: "" });
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    setAlert({ type: "", msg: "" });

    try {
      if (authMode === "signin") {
        // Primary: Supabase client direct sign-in
        const { data: sbData, error: sbError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim()
        });

        if (!sbError && sbData?.session?.access_token) {
          localStorage.setItem("sb_access_token", sbData.session.access_token);
          console.info("[AUTH] Session initialized. Access token stored.");
          setAlert({ type: "success", msg: "Authentication successful! Redirecting..." });
          setTimeout(() => {
            onLoginSuccess();
          }, 500);
          return;
        }

        // Secondary fallback: API login route
        const res = await fetch(getApiUrl("/api/user/login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password: password.trim() })
        });
        const data = await res.json();

        if (res.ok && data.success && data.access_token) {
          localStorage.setItem("sb_access_token", data.access_token);
          if (data.refresh_token) {
            await supabase.auth.setSession({
              access_token: data.access_token,
              refresh_token: data.refresh_token
            }).catch(() => {});
          }
          setAlert({ type: "success", msg: data.message || "Authentication successful! Redirecting..." });
          setTimeout(() => {
            onLoginSuccess();
          }, 500);
        } else {
          setAlert({ type: "error", msg: data.detail || sbError?.message || "Authentication failed." });
        }
      } else {
        // Sign up mode
        const { data: sbData, error: sbError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim()
        });

        if (sbError) {
          setAlert({ type: "error", msg: sbError.message });
        } else if (sbData?.session?.access_token) {
          localStorage.setItem("sb_access_token", sbData.session.access_token);
          setAlert({ type: "success", msg: "Registration successful! Redirecting..." });
          setTimeout(() => {
            onLoginSuccess();
          }, 500);
        } else {
          setAlert({ type: "success", msg: "Registration successful! Please check your email to confirm your account." });
        }
      }
    } catch (err) {
      setAlert({ type: "error", msg: "Network error: " + err });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0e11", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: "440px", background: "rgba(30, 35, 41, 0.85)", border: "1px solid #2b3139", borderRadius: "16px", padding: "36px 32px", backdropFilter: "blur(12px)" }}>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ width: "56px", height: "56px", background: "rgba(252, 213, 53, 0.1)", border: "1px solid rgba(252, 213, 53, 0.3)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "var(--primary-yellow)", fontSize: "24px" }}>
            <i className="fa-paper-plane fa-solid"></i>
          </div>
          <h2 style={{ fontSize: "24px", fontWeight: "700", color: "#ffffff" }}>
            Telegram<span style={{ color: "var(--primary-yellow)" }}>Sync</span> Studio
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
            Sign in to access your multi-tenant Telegram channel studio
          </p>
        </div>

        <div style={{ display: "flex", background: "rgba(0, 0, 0, 0.3)", padding: "4px", borderRadius: "10px", border: "1px solid #2b3139", marginBottom: "24px" }}>
          <button
            type="button"
            style={{ flex: 1, padding: "10px", background: authMode === "signin" ? "var(--primary-yellow)" : "transparent", color: authMode === "signin" ? "#000" : "var(--text-muted)", fontWeight: "600", borderRadius: "8px", border: "none", cursor: "pointer" }}
            onClick={() => setAuthMode("signin")}
          >
            Sign In
          </button>
          <button
            type="button"
            style={{ flex: 1, padding: "10px", background: authMode === "signup" ? "var(--primary-yellow)" : "transparent", color: authMode === "signup" ? "#000" : "var(--text-muted)", fontWeight: "600", borderRadius: "8px", border: "none", cursor: "pointer" }}
            onClick={() => setAuthMode("signup")}
          >
            Create Account
          </button>
        </div>

        {alert.msg && (
          <div style={{ padding: "12px", borderRadius: "8px", fontSize: "13px", marginBottom: "20px", background: alert.type === "success" ? "rgba(14, 203, 129, 0.15)" : "rgba(246, 70, 93, 0.15)", border: `1px solid ${alert.type === "success" ? "rgba(14, 203, 129, 0.3)" : "rgba(246, 70, 93, 0.3)"}`, color: alert.type === "success" ? "var(--accent-green)" : "var(--accent-red)" }}>
            {alert.msg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Email Address</label>
            <input
              type="email"
              className="form-control"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>Password</label>
              {authMode === "signin" && (
                <button
                  type="button"
                  onClick={() => setIsForgotModalOpen(true)}
                  style={{ background: "none", border: "none", color: "var(--primary-yellow)", fontSize: "12px", cursor: "pointer", padding: 0 }}
                >
                  Forgot Password?
                </button>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                className="form-control"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <i
                className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`}
                style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-muted)" }}
                onClick={() => setShowPassword(!showPassword)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-100"
            style={{ width: "100%", padding: "12px", background: "var(--primary-yellow)", color: "#000", fontWeight: "700" }}
            disabled={loading}
          >
            {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className={`fa-solid ${authMode === "signin" ? "fa-right-to-bracket" : "fa-user-plus"}`}></i>}
            {" "}{authMode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <ForgotPasswordModal
          isOpen={isForgotModalOpen}
          onClose={() => setIsForgotModalOpen(false)}
        />
      </div>
    </div>
  );
}
