import { useEffect } from 'preact/hooks';
import { LocationProvider, Router, Route } from 'preact-iso';
import { NavShell } from './components/nav/NavShell';
import { Live } from './routes/Live';
import { History } from './routes/History';
import { SessionDetail } from './routes/SessionDetail';
import { Alarm } from './routes/Alarm';
import { Settings } from './routes/Settings';
import { Setup } from './routes/Setup';
import { connectWs } from './lib/ws';

export function App() {
  useEffect(() => {
    const ws = connectWs();
    return () => ws.close();
  }, []);

  return (
    <LocationProvider>
      <NavShell>
        <Router>
          <Route path="/"             component={Live} />
          <Route path="/history"      component={History} />
          <Route path="/sessions/:id" component={SessionDetail} />
          <Route path="/alarm"        component={Alarm} />
          <Route path="/settings"     component={Settings} />
          <Route path="/setup"        component={Setup} />
          <Route default component={Live} />
        </Router>
      </NavShell>
    </LocationProvider>
  );
}
