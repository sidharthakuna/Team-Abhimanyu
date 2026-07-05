import { useState } from "react";
import { RoleSelect } from "../../components/RoleSelect/RoleSelect";
import { UsernameGate } from "../../components/UsernameGate/UsernameGate";
import "./Landing.css";

export function Landing({ onEnter }) {
  const [pendingRole, setPendingRole] = useState(null); // role awaiting a username, or null

  function handleSelectRole(role) {
    setPendingRole(role);
  }

  function handleUsernameSubmit(username) {
    onEnter(pendingRole, username);
    setPendingRole(null);
  }

  return (
    <div className="landing-page">
      <RoleSelect onSelectRole={handleSelectRole} />
      {pendingRole && (
        <UsernameGate
          role={pendingRole}
          onSubmit={handleUsernameSubmit}
          onCancel={() => setPendingRole(null)}
        />
      )}
    </div>
  );
}