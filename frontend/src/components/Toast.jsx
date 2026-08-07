import React, { useEffect } from "react";

export default function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      if (onClose) onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!message) return null;

  const isSuccess = type === "success";
  const isError = type === "error";
  const isWarning = type === "warning";

  const bg = isSuccess
    ? "rgba(16, 185, 129, 0.15)"
    : isError
    ? "rgba(239, 68, 68, 0.15)"
    : isWarning
    ? "rgba(245, 158, 11, 0.15)"
    : "rgba(59, 130, 246, 0.15)";

  const border = isSuccess
    ? "1px solid rgba(16, 185, 129, 0.4)"
    : isError
    ? "1px solid rgba(239, 68, 68, 0.4)"
    : isWarning
    ? "1px solid rgba(245, 158, 11, 0.4)"
    : "1px solid rgba(59, 130, 246, 0.4)";

  const iconColor = isSuccess
    ? "#10b981"
    : isError
    ? "#ef4444"
    : isWarning
    ? "#f59e0b"
    : "#3b82f6";

  const iconClass = isSuccess
    ? "fa-solid fa-circle-check"
    : isError
    ? "fa-solid fa-circle-xmark"
    : isWarning
    ? "fa-solid fa-triangle-exclamation"
    : "fa-solid fa-circle-info";

  return (
    <div
      style={{
        position: "fixed",
        top: "24px",
        right: "24px",
        zIndex: 99999,
        minWidth: "320px",
        maxWidth: "460px",
        background: "rgba(13, 18, 30, 0.95)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: border,
        borderRadius: "12px",
        padding: "14px 18px",
        boxShadow: "0 20px 30px rgba(0, 0, 0, 0.6), 0 0 15px " + bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        animation: "toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        color: "#ffffff"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
        <div
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "50%",
            background: bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}
        >
          <i className={iconClass} style={{ color: iconColor, fontSize: "18px" }}></i>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: "700", fontSize: "13px", color: "#ffffff", marginBottom: "2px" }}>
            {isSuccess ? "Success" : isError ? "Action Failed" : isWarning ? "Warning" : "Notice"}
          </div>
          <div style={{ fontSize: "12px", color: "#cbd5e1", lineHeight: "1.4", wordBreak: "break-word" }}>
            {message}
          </div>
        </div>
      </div>
      <button
        onClick={onClose}
        style={{
          background: "transparent",
          border: "none",
          color: "#94a3b8",
          cursor: "pointer",
          fontSize: "14px",
          padding: "4px",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}
        title="Close"
      >
        <i className="fa-solid fa-xmark"></i>
      </button>
    </div>
  );
}
