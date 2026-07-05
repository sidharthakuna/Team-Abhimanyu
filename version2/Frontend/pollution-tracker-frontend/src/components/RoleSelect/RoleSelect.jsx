import "./RoleSelect.css";

export function RoleSelect({ onSelectRole }) {
  return (
    <div className="role-select">
      <div className="role-select__intro">
        <span className="role-select__eyebrow">CleanAir Tracker</span>
        <h1 className="role-select__heading">Report it. Track it. Clean it up.</h1>
        <p className="role-select__sub">
          Choose how you're using the app today.
        </p>
      </div>

      <div className="role-select__cards">
        <button
          className="role-card role-card--citizen"
          onClick={() => onSelectRole("citizen")}
        >
          <span className="role-card__icon" aria-hidden="true">📷</span>
          <span className="role-card__title">I'm a Citizen</span>
          <span className="role-card__desc">Report garbage, pollution, or a fire near you</span>
          <span className="role-card__arrow" aria-hidden="true">→</span>
        </button>

        <button
          className="role-card role-card--municipal"
          onClick={() => onSelectRole("municipal")}
        >
          <span className="role-card__icon" aria-hidden="true">🧹</span>
          <span className="role-card__title">I'm Municipal Staff</span>
          <span className="role-card__desc">View reports, assign work, verify clean-ups</span>
          <span className="role-card__arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}