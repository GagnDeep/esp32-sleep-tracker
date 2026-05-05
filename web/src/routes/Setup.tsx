// First-boot wizard. The ESP32 captive portal usually handles network
// pick + password directly via WiFiManager, so this route is the
// post-AP redirect: confirm device name + time zone before recording.

import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { api, type SettingsBody } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export function Setup() {
  const [s, setS] = useState<SettingsBody | null>(null);
  const { route } = useLocation();

  useEffect(() => { api.getSettings().then(setS); }, []);

  if (!s) return <div class="max-w-md mx-auto py-10">Loading…</div>;

  const finish = async () => {
    await api.putSettings({ device_name: s.device_name, timezone: s.timezone });
    route('/');
  };

  return (
    <div class="max-w-md mx-auto py-10 space-y-4">
      <h1 class="text-xl font-semibold tracking-tight">Welcome</h1>
      <p class="text-sm text-ink-muted">Two quick things and you're ready to record your first night.</p>

      <Card title="Device name">
        <input type="text" value={s.device_name}
               onChange={(e) => setS({ ...s, device_name: (e.currentTarget as HTMLInputElement).value })}
               placeholder="bedside-tracker"
               class="h-10 px-3 rounded-xl bg-surface w-full" />
      </Card>

      <Card title="Time zone (POSIX)">
        <input type="text" value={s.timezone}
               onChange={(e) => setS({ ...s, timezone: (e.currentTarget as HTMLInputElement).value })}
               placeholder="EST5EDT,M3.2.0,M11.1.0"
               class="h-10 px-3 rounded-xl bg-surface w-full font-mono text-sm" />
        <p class="text-xs text-ink-muted mt-2">
          Examples: <code>UTC0</code>, <code>EST5EDT,M3.2.0,M11.1.0</code>, <code>CET-1CEST,M3.5.0,M10.5.0/3</code>.
        </p>
      </Card>

      <Button class="w-full" size="lg" onClick={finish}>Done</Button>
    </div>
  );
}
