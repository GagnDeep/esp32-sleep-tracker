import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { liveStats, deviceStatus, wsState, wsRetryAt, wsDrops } from '../lib/store';
import { api, type SettingsBody } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { NumberTile } from '../components/ui/NumberTile';
import { Pill } from '../components/ui/Pill';
import { EmptyState } from '../components/ui/EmptyState';
import { HrSpo2Chart } from '../components/charts/HrSpo2Chart';
import { formatBpm, formatPct, stageLabels } from '../lib/format';

const ROLLING_S = 60;

function formatHMS(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(ss)}`;
}

export function Live() {
  const [busy, setBusy] = useState(false);
  const tsRef = useRef<number[]>([]);
  const hrRef = useRef<(number | null)[]>([]);
  const sxRef = useRef<(number | null)[]>([]);
  // Throttled rerender via requestAnimationFrame: WS samples can arrive
  // 25–50/s; capping chart redraws to ≤30 fps keeps the main thread
  // calm without dropping samples from the rolling buffer.
  const [, force] = useState(0);
  const rafRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const lastFlushRef = useRef(0);

  const [chartTick, setChartTick] = useState(0);

  // Settings — fetched once on mount so we can draw the SpO2 threshold
  // reference line on the live chart.
  const [settings, setSettings] = useState<SettingsBody | null>(null);
  useEffect(() => {
    let alive = true;
    api.getSettings().then((s) => { if (alive) setSettings(s); }).catch(() => { /* threshold optional */ });
    return () => { alive = false; };
  }, []);

  // Session-elapsed timer: when /api/status reports a new session_id we
  // capture wall-clock start; reset whenever it goes inactive.
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const [elapsedS, setElapsedS] = useState(0);
  const sidRef = useRef<string | null>(null);

  // Pull /api/status periodically for the things WS doesn't push.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await api.status();
        if (!alive) return;
        deviceStatus.value = s;
        if (s.session_active && s.session_id) {
          if (sidRef.current !== s.session_id) {
            sidRef.current = s.session_id;
            setSessionStart(Date.now());
          }
        } else if (sidRef.current !== null) {
          sidRef.current = null;
          setSessionStart(null);
        }
      } catch { /* badge will show offline */ }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Tick the elapsed timer locally every second so the display stays
  // smooth between status polls.
  useEffect(() => {
    if (sessionStart == null) { setElapsedS(0); return; }
    const id = setInterval(() => {
      setElapsedS(Math.max(0, (Date.now() - sessionStart) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [sessionStart]);

  // Append every live signal frame into the rolling chart buffer.
  // Mark dirty + schedule a rAF flush; the actual chart `setData` runs
  // at most once per frame.
  useEffect(() => {
    const flush = () => {
      rafRef.current = null;
      if (!dirtyRef.current) return;
      const now = performance.now();
      // ≤30 fps throttle (~33ms per flush).
      if (now - lastFlushRef.current < 33) {
        rafRef.current = requestAnimationFrame(flush);
        return;
      }
      lastFlushRef.current = now;
      dirtyRef.current = false;
      setChartTick((n) => (n + 1) & 0xFFFF);
      // Also bump the stat-tile re-render so HR/SpO2 numbers refresh.
      force((n) => (n + 1) & 0xFF);
    };
    return liveStats.subscribe((s) => {
      const t = (s.t || 0) / 1000;
      tsRef.current.push(t);
      hrRef.current.push(s.hr || null);
      sxRef.current.push(s.spo2 || null);
      while (tsRef.current.length > ROLLING_S * 2) {
        tsRef.current.shift();
        hrRef.current.shift();
        sxRef.current.shift();
      }
      dirtyRef.current = true;
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    });
  }, []);

  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  const stats = liveStats.value;
  const status = deviceStatus.value;
  const recording = status?.session_active;
  const ws = wsState.value;
  const retryAt = wsRetryAt.value;
  const drops = wsDrops.value;

  const chartData = useMemo<[number[], (number | null)[], (number | null)[]]>(
    () => [tsRef.current.slice(), hrRef.current.slice(), sxRef.current.slice()],
    [chartTick],
  );
  const noLiveData = tsRef.current.length === 0;

  const spo2Threshold = settings ? settings.spo2_low_x10 / 10 : undefined;

  const start = async () => {
    setBusy(true);
    try { await api.startSession(); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    setBusy(true);
    try { await api.stopSession(); }
    finally { setBusy(false); }
  };

  return (
    <div class="space-y-4 max-w-3xl mx-auto py-4">
      {ws !== 'connected' && (
        <ReconnectBanner state={ws} retryAt={retryAt} />
      )}
      {drops > 0 && (
        <div class="flex justify-end">
          <Pill tone="warn">dropped {drops} sample{drops === 1 ? '' : 's'}</Pill>
        </div>
      )}

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <NumberTile
          label="Heart rate"
          value={formatBpm(stats.hr)}
          unit="bpm"
          tone="accent"
        />
        <NumberTile
          label="SpO₂"
          value={formatPct(stats.spo2)}
          unit="%"
          tone={stats.spo2 && stats.spo2 < 90 ? 'bad' : 'default'}
        />
        <NumberTile
          label="Movement"
          value={String(stats.activity)}
          unit="/1000"
          hint={stageLabels[stats.stage]}
        />
      </div>

      <Card title="Live waveform" hint={`last ${ROLLING_S}s`}>
        {noLiveData ? (
          <EmptyState
            title="Waiting for samples"
            msg={ws === 'connected'
              ? 'Place your finger on the sensor to start streaming.'
              : 'Reconnecting to the device…'}
          />
        ) : (
          <HrSpo2Chart
            live
            data={chartData}
            spo2Threshold={spo2Threshold}
          />
        )}
      </Card>

      <Card title="Recording">
        <div class="flex items-center justify-between gap-4">
          <div class="space-y-1">
            <div class="text-sm text-ink-muted">
              {recording ? 'In progress' : 'Ready when you are.'}
            </div>
            {recording && (
              <Pill tone="accent">
                <span class="font-mono tabular-nums">{formatHMS(elapsedS)}</span>
                {status?.session_id && <> · {status.session_id}</>}
              </Pill>
            )}
            {!recording && (
              <Pill tone="neutral">
                <span class="font-mono tabular-nums">00:00:00</span>
              </Pill>
            )}
          </div>
          {recording
            ? <Button variant="danger" onClick={stop}    disabled={busy}>Stop</Button>
            : <Button                onClick={start}   disabled={busy}>Start session</Button>}
        </div>
      </Card>
    </div>
  );
}

function ReconnectBanner({ state, retryAt }: { state: 'connecting' | 'disconnected'; retryAt: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const secs = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : null;
  const label = state === 'connecting'
    ? 'Connecting to device…'
    : (secs != null ? `Disconnected. Retrying in ${secs}s…` : 'Disconnected. Retrying…');
  return (
    <div role="status"
         class="rounded-xl bg-warn/15 text-warn px-3 py-2 text-xs flex items-center justify-between gap-2">
      <span>{label}</span>
      <span aria-hidden="true" class="h-1.5 w-1.5 rounded-full bg-warn animate-pulse" />
    </div>
  );
}
