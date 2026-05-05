import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { api, ApiError } from '../lib/api';
import { setPin, pinRequired } from '../lib/auth';
import { notify } from '../lib/toast';

// PIN gate. The user lands here when /api/auth/check returns 401 either
// at boot or in response to a mutation. We don't navigate away from
// here until the device says the pin is right (204).
export function Unlock() {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const loc = useLocation();

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{4}$/.test(value)) {
      setErr('Pin must be 4 digits.');
      return;
    }
    setErr(null);
    setBusy(true);
    setPin(value);
    try {
      await api.authCheck();
      pinRequired.value = false;
      notify('success', 'Unlocked.');
      loc.route('/');
    } catch (ex) {
      const status = ex instanceof ApiError ? ex.status : 0;
      if (status === 401) {
        setErr('Wrong PIN.');
        notify('error', 'Wrong PIN.');
      } else {
        setErr(`Unlock failed: ${(ex as Error).message}`);
        notify('error', `Unlock failed: ${(ex as Error).message}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="max-w-sm mx-auto py-10">
      <Card title="Enter PIN">
        <form onSubmit={submit} class="space-y-3">
          <label class="block">
            <span class="block text-xs text-ink-muted mb-1">4-digit PIN</span>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoFocus
              value={value}
              onInput={(e) => setValue((e.currentTarget as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4))}
              class="h-10 px-3 rounded-xl bg-surface text-ink w-full font-mono tracking-[0.5em] text-center"
            />
          </label>
          {err && <p class="text-sm text-bad">{err}</p>}
          <Button type="submit" disabled={busy || value.length !== 4} class="w-full">
            {busy ? <Spinner size={14} label="Checking" /> : 'Unlock'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
