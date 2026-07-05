import { useState } from "react";
import "./UsernameGate.css";

export function UsernameGate({ role, onSubmit, onCancel }) {
  const [value, setValue] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    onSubmit(value.trim());
  }

  return (
    <div className="username-gate">
      <div className="username-gate__card">
        <button className="username-gate__cancel" onClick={onCancel} aria-label="Cancel">
          ×
        </button>

        <span className="username-gate__eyebrow">
          {role === "municipal" ? "Municipal Login" : "Citizen Login"}
        </span>
        <h2 className="username-gate__heading">What should we call you?</h2>
        <p className="username-gate__sub">
          {role === "municipal"
            ? "Enter a username to sign in. It's saved on this device — no password needed."
            : "Enter a username so your reports are remembered on this device."}
        </p>

        <form onSubmit={handleSubmit} className="username-gate__form">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. sidhartha_92"
            autoFocus
            maxLength={40}
            className="username-gate__input"
          />
          <button type="submit" className="username-gate__submit" disabled={!value.trim()}>
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}