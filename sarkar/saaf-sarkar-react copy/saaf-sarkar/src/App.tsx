import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { SessionProvider } from './context/SessionContext';
import { ToastProvider } from './context/ToastContext';

import Landing from './pages/Landing';
import CitizenLogin from './pages/CitizenLogin';
import CitizenReport from './pages/CitizenReport';
import CitizenTrack from './pages/CitizenTrack';
import MunicipalLogin from './pages/MunicipalLogin';
import MunicipalDashboard from './pages/MunicipalDashboard';

function App() {
  return (
    // ThemeProvider sits outside SessionProvider: theme is a per-browser
    // preference, not per-role, so it must survive clearSession() calls
    // (e.g. Landing wipes session on every visit — see Landing.tsx).
    <ThemeProvider>
      <SessionProvider>
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
      </SessionProvider>
    </ThemeProvider>
  );
}

export default App;