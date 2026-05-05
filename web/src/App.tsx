import { useEffect } from 'preact/hooks';
import { LocationProvider, Router, Route, useLocation } from 'preact-iso';
import { NavShell } from './components/nav/NavShell';
import { Live } from './routes/Live';
import { History } from './routes/History';
import { Trends } from './routes/Trends';
import { SessionDetail } from './routes/SessionDetail';
import { Compare } from './routes/Compare';
import { Alarm } from './routes/Alarm';
import { Settings } from './routes/Settings';
import { Setup } from './routes/Setup';
import { Unlock } from './routes/Unlock';
import { connectWs } from './lib/ws';
import { ToastHost } from './components/ui/ToastHost';
import { api, ApiError } from './lib/api';
import { pinRequired } from './lib/auth';
// Importing the theme module mounts its localStorage effect and writes
// `data-theme` on <html>; we don't need anything else from it here.
import './lib/theme';

export function App() {
  useEffect(() => {
    const ws = connectWs();
    return () => ws.close();
  }, []);

  // Pin probe at boot. If the device is locked we set pinRequired and
  // the gate component below redirects. We swallow non-401 errors —
  // the user might just be offline.
  useEffect(() => {
    let alive = true;
    api.authCheck().catch((err) => {
      if (!alive) return;
      if (err instanceof ApiError && err.status === 401) {
        pinRequired.value = true;
      }
    });
    return () => { alive = false; };
  }, []);

  return (
    <LocationProvider>
      <PinGate />
      <NavShell>
        <Router>
          <Route path="/"             component={Live} />
          <Route path="/history"      component={History} />
          <Route path="/trends"       component={Trends} />
          <Route path="/compare"      component={Compare} />
          <Route path="/sessions/:id" component={SessionDetail} />
          <Route path="/alarm"        component={Alarm} />
          <Route path="/settings"     component={Settings} />
          <Route path="/setup"        component={Setup} />
          <Route path="/unlock"       component={Unlock} />
          <Route default component={Live} />
        </Router>
      </NavShell>
      <ToastHost />
    </LocationProvider>
  );
}

// When the device says we're locked and we're not already on /unlock,
// punt over there. Lives inside LocationProvider so useLocation works.
function PinGate() {
  const loc = useLocation();
  useEffect(() => {
    if (pinRequired.value && loc.path !== '/unlock') {
      loc.route('/unlock');
    }
  }, [loc.path, pinRequired.value]);
  return null;
}
