import "./Legend.css";

export function Legend() {
  return (
    <div className="legend">
      <div className="legend__group">
        <span className="legend__dot" style={{ background: "var(--color-pending)" }} />
        <span>Pending</span>
      </div>
      <div className="legend__group">
        <span className="legend__dot" style={{ background: "var(--color-assigned)" }} />
        <span>Assigned</span>
      </div>
      <div className="legend__group">
        <span className="legend__dot" style={{ background: "var(--color-resolved)" }} />
        <span>Resolved</span>
      </div>
      <div className="legend__divider" />
      <div className="legend__group">
        <span className="legend__dot legend__dot--ring" style={{ borderColor: "var(--color-pending)" }} />
        <span>Before photo</span>
      </div>
      <div className="legend__group">
        <span className="legend__dot legend__dot--ring" style={{ borderColor: "var(--color-resolved)" }} />
        <span>After photo</span>
      </div>
    </div>
  );
}