import { useEffect } from "react";
import "./Toast.css";

// tone: "success" | "error" | "info"
export function Toast({ message, tone = "info", onDismiss, duration = 4000 }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  return (
    <div className={`toast toast--${tone}`} role="status">
      <span className="toast__message">{message}</span>
      <button className="toast__close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}