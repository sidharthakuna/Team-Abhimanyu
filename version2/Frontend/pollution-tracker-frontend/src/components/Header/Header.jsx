import "./Header.css";

export function Header({ role, username, onSwitchRole, onLogout }) {
  const isMunicipal = role === "municipal";

  return (
    <header className={`app-header ${isMunicipal ? "app-header--municipal" : "app-header--citizen"}`}>
      <button className="app-header__brand" onClick={onSwitchRole} aria-label="Back to role selection">
        <span className="app-header__dot" aria-hidden="true" />
        <span className="app-header__title">CleanAir Tracker</span>
      </button>

      <div className="app-header__right">
        <span className="app-header__role-badge">{isMunicipal ? "Municipal" : "Citizen"}</span>
        {username && (
          <div className="app-header__user">
            <span className="app-header__username">{username}</span>
            {onLogout && (
              <button className="app-header__logout" onClick={onLogout}>
                Switch user
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}