import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

import Landing from './pages/Landing';
import CitizenLogin from './pages/CitizenLogin';
import CitizenReport from './pages/CitizenReport';
import CitizenTrack from './pages/CitizenTrack';
import MunicipalLogin from './pages/MunicipalLogin';
import MunicipalDashboard from './pages/MunicipalDashboard';

// Same Client ID your backend already validates against in config.py /
// GOOGLE_CLIENT_ID — this one is safe to expose in frontend JS (see
// config.py's comment on GOOGLE_CLIENT_ID: it's an OAuth Client ID, not
// a secret). Set VITE_GOOGLE_CLIENT_ID in the frontend .env to the same
// value you put in the backend .env's GOOGLE_CLIENT_ID.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function App() {
  return (
    // ThemeProvider sits outside AuthProvider: theme is a per-browser
    // preference, not per-session, so it must survive logout() calls
    // (Landing clears auth on every visit — see Landing.tsx).
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Landing />} />

                <Route path="/citizen/login" element={<CitizenLogin />} />
                <Route path="/citizen/report" element={<CitizenReport />} />
                <Route path="/citizen/track" element={<CitizenTrack />} />

                <Route path="/municipal/login" element={<MunicipalLogin />} />
                <Route path="/municipal/dashboard" element={<MunicipalDashboard />} />
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  );
}

export default App;