// Simple localStorage-backed "login" — no backend auth exists yet (see
// services/api.js: there is no /auth endpoint in this backend), so a
// username is just a display identity stored in the browser. Works for
// both roles; MunicipalDashboard uses it to show "logged in as X" and
// let the member switch identities.

import { useCallback, useState } from "react";
import { USERNAME_STORAGE_KEY } from "../services/constants";

export function useUsername() {
  const [username, setUsernameState] = useState(() => {
    return localStorage.getItem(USERNAME_STORAGE_KEY) || "";
  });

  const setUsername = useCallback((name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem(USERNAME_STORAGE_KEY, trimmed);
    setUsernameState(trimmed);
  }, []);

  const clearUsername = useCallback(() => {
    localStorage.removeItem(USERNAME_STORAGE_KEY);
    setUsernameState("");
  }, []);

  return { username, setUsername, clearUsername, isLoggedIn: Boolean(username) };
}