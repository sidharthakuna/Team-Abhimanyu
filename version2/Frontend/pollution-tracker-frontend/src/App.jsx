import { useState } from "react";
import { Landing } from "./pages/Landing/Landing";
import { CitizenReport } from "./pages/CitizenReport/CitizenReport";
import { MunicipalDashboard } from "./pages/MunicipalDashboard/MunicipalDashboard";
import { useUsername } from "./hooks/useUsername";
import { ROLE_STORAGE_KEY, ROLES } from "./services/constants";
import "./App.css";

function App() {
  const { username, setUsername, clearUsername, isLoggedIn } = useUsername();
  const [role, setRole] = useState(() => localStorage.getItem(ROLE_STORAGE_KEY) || null);

  function handleEnter(selectedRole, selectedUsername) {
    setUsername(selectedUsername);
    localStorage.setItem(ROLE_STORAGE_KEY, selectedRole);
    setRole(selectedRole);
  }

  function handleSwitchRole() {
    // Going back to the landing page doesn't clear the saved username —
    // only "Switch user" does. This lets someone bounce between roles
    // without retyping a name they already gave.
    localStorage.removeItem(ROLE_STORAGE_KEY);
    setRole(null);
  }

  function handleLogout() {
    clearUsername();
    localStorage.removeItem(ROLE_STORAGE_KEY);
    setRole(null);
  }

  if (!role || !isLoggedIn) {
    return <Landing onEnter={handleEnter} />;
  }

  if (role === ROLES.municipal) {
    return (
      <MunicipalDashboard username={username} onSwitchRole={handleSwitchRole} onLogout={handleLogout} />
    );
  }

  return <CitizenReport username={username} onSwitchRole={handleSwitchRole} onLogout={handleLogout} />;
}

export default App;