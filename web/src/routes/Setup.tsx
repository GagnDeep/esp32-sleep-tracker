// Multi-step first-boot wizard. Steps:
//   0  Pick WiFi (scan list with signal bars + lock icons)
//   1  Password (with reveal toggle)
//   2  Device name + timezone
//   3  Done

import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { api, type SettingsBody, type WifiNetwork } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { notify } from '../lib/toast';

type Step = 0 | 1 | 2;

export function Setup() {
  const [step, setStep] = useState<Step>(0);
  const [s, setS] = useState<SettingsBody | null>(null);
  const [ssid, setSsid] = useState('');
  const [enc, setEnc] = useState<string>('');
  const [pw, setPw] = useState('');
  const { route } = useLocation();

  useEffect(() => { api.getSettings().then(setS); }, []);

  if (!s) return <div class="max-w-md mx-auto py-10">Loading…</div>;

  const finish = async () => {
    try {
      await api.putSettings({ device_name: s.device_name, timezone: s.timezone });
      notify('success', 'Setup complete.');
      route('/');
    } catch (e) {
      notify('error', `Couldn't save: ${(e as Error).message}`);
    }
  };

  return (
    <div class="max-w-md mx-auto py-10 space-y-4">
      <header class="flex items-center justify-between">
        <h1 class="text-xl font-semibold tracking-tight">Welcome</h1>
        <span class="text-xs text-ink-muted">Step {step + 1} / 3</span>
      </header>

      {step === 0 && (
        <WifiStep
          selected={ssid}
          onSelect={(net) => { setSsid(net.ssid); setEnc(net.enc); }}
          onNext={() => setStep(1)}
        />
      )}

      {step === 1 && (
        <PasswordStep
          ssid={ssid}
          enc={enc}
          pw={pw}
          onPw={setPw}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <FinalStep
          s={s}
          onChange={(p) => setS({ ...s, ...p })}
          onBack={() => setStep(1)}
          onFinish={finish}
        />
      )}
    </div>
  );
}

function WifiStep({
  selected, onSelect, onNext,
}: { selected: string; onSelect: (n: WifiNetwork) => void; onNext: () => void }) {
  const [list, setList] = useState<WifiNetwork[] | null>(null);
  const [busy, setBusy] = useState(false);

  const scan = async () => {
    setBusy(true);
    try {
      const nets = await api.wifiScan();
      // Sort by RSSI descending so the strongest network is on top.
      nets.sort((a, b) => b.rssi - a.rssi);
      setList(nets);
    } catch (e) {
      notify('error', `Scan failed: ${(e as Error).message}`);
      setList([]);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { scan(); /* eslint-disable-line */ }, []);

  return (
    <Card title="Pick WiFi" hint={busy ? <Spinner size={12} /> : <button class="text-xs underline" onClick={scan}>Rescan</button>}>
      {list == null ? (
        <div class="py-4 text-sm text-ink-muted">Scanning…</div>
      ) : list.length === 0 ? (
        <div class="py-4 text-sm text-ink-muted">No networks found.</div>
      ) : (
        <ul class="space-y-1">
          {list.map((n) => (
            <li key={n.ssid + n.rssi}>
              <button type="button"
                      onClick={() => onSelect(n)}
                      aria-pressed={selected === n.ssid}
                      class={[
                        'w-full flex items-center gap-3 h-10 px-3 rounded-xl text-left',
                        selected === n.ssid ? 'bg-accent-soft/30 text-accent' : 'bg-surface hover:bg-surface-2',
                      ].join(' ')}>
                <SignalBars rssi={n.rssi} />
                <span class="flex-1 truncate text-sm">{n.ssid || '<hidden>'}</span>
                {n.enc && n.enc.toLowerCase() !== 'open' && (
                  <span aria-label="secured" title="Secured">🔒</span>
                )}
                <span class="font-mono text-xs text-ink-muted">{n.rssi} dBm</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div class="mt-4 flex justify-end">
        <Button onClick={onNext} disabled={!selected}>Next</Button>
      </div>
    </Card>
  );
}

function PasswordStep({
  ssid, enc, pw, onPw, onBack, onNext,
}: { ssid: string; enc: string; pw: string; onPw: (v: string) => void; onBack: () => void; onNext: () => void }) {
  const [reveal, setReveal] = useState(false);
  const isOpen = !enc || enc.toLowerCase() === 'open';

  return (
    <Card title={`Password for ${ssid}`}>
      {isOpen ? (
        <p class="text-sm text-ink-muted mb-3">Open network — no password needed.</p>
      ) : (
        <label class="block mb-3">
          <span class="block text-xs text-ink-muted mb-1">Password</span>
          <div class="flex gap-2">
            <input type={reveal ? 'text' : 'password'}
                   value={pw}
                   onInput={(e) => onPw((e.currentTarget as HTMLInputElement).value)}
                   class="h-10 px-3 rounded-xl bg-surface text-ink flex-1 font-mono" />
            <button type="button"
                    onClick={() => setReveal((r) => !r)}
                    aria-label={reveal ? 'Hide password' : 'Show password'}
                    class="h-10 px-3 rounded-xl bg-surface text-ink-muted hover:text-ink">
              {reveal ? '🙈' : '👁'}
            </button>
          </div>
        </label>
      )}
      <p class="text-xs text-ink-muted">
        WiFi is provisioned via the captive portal — this step records your choice for the next reboot.
      </p>
      <div class="mt-4 flex justify-between gap-2">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button onClick={onNext}>Next</Button>
      </div>
    </Card>
  );
}

function FinalStep({
  s, onChange, onBack, onFinish,
}: { s: SettingsBody; onChange: (p: Partial<SettingsBody>) => void; onBack: () => void; onFinish: () => void }) {
  return (
    <>
      <Card title="Device name">
        <input type="text" value={s.device_name}
               onChange={(e) => onChange({ device_name: (e.currentTarget as HTMLInputElement).value })}
               placeholder="bedside-tracker"
               class="h-10 px-3 rounded-xl bg-surface w-full" />
      </Card>

      <Card title="Time zone (POSIX)">
        <input type="text" value={s.timezone}
               onChange={(e) => onChange({ timezone: (e.currentTarget as HTMLInputElement).value })}
               placeholder="EST5EDT,M3.2.0,M11.1.0"
               class="h-10 px-3 rounded-xl bg-surface w-full font-mono text-sm" />
        <p class="text-xs text-ink-muted mt-2">
          Examples: <code>UTC0</code>, <code>EST5EDT,M3.2.0,M11.1.0</code>, <code>CET-1CEST,M3.5.0,M10.5.0/3</code>.
        </p>
      </Card>

      <div class="flex justify-between gap-2">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button onClick={onFinish}>Done</Button>
      </div>
    </>
  );
}

function SignalBars({ rssi }: { rssi: number }) {
  // -80 dBm → 1 bar, -50 dBm → 4 bars, linear in between.
  const bars = Math.max(1, Math.min(4, Math.round(((rssi + 80) / 30) * 4)));
  return (
    <span class="inline-flex items-end gap-0.5 h-4 w-5" aria-label={`signal ${bars}/4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i}
              class={['w-1 rounded-sm', i <= bars ? 'bg-accent' : 'bg-surface-2'].join(' ')}
              style={{ height: `${i * 25}%` }} />
      ))}
    </span>
  );
}
