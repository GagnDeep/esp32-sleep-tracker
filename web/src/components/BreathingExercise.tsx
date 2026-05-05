// 4-7-8 box-breathing helper. Modal that loops 4 cycles of:
//   inhale 4 s · hold 7 s · exhale 8 s.
// The visual is a circle that scales from small → large → small. We
// honour `prefers-reduced-motion` by skipping the scale transition;
// the phase label still updates so users still get the rhythm.

import { useEffect, useState } from 'preact/hooks';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';

type Phase = 'inhale' | 'hold' | 'exhale' | 'done';

interface PhaseStep { phase: Exclude<Phase, 'done'>; ms: number; label: string }
const STEPS: PhaseStep[] = [
  { phase: 'inhale', ms: 4000, label: 'Breathe in' },
  { phase: 'hold',   ms: 7000, label: 'Hold' },
  { phase: 'exhale', ms: 8000, label: 'Breathe out' },
];
const CYCLES = 4;

interface Props { open: boolean; onClose: () => void }

export function BreathingExercise({ open, onClose }: Props) {
  const [cycle, setCycle] = useState(0);
  const [step, setStep]   = useState(0);
  const [tStart, setTStart] = useState<number>(0);
  const [now, setNow] = useState<number>(0);

  // Reset whenever we (re)open.
  useEffect(() => {
    if (!open) return;
    setCycle(0); setStep(0); setTStart(performance.now()); setNow(performance.now());
  }, [open]);

  // Step driver. Re-runs as the indices change.
  useEffect(() => {
    if (!open) return;
    if (cycle >= CYCLES) return;
    const start = performance.now();
    setTStart(start);
    let raf = 0;
    const tick = () => {
      const t = performance.now();
      setNow(t);
      const dur = STEPS[step].ms;
      if (t - start >= dur) {
        if (step === STEPS.length - 1) {
          if (cycle + 1 >= CYCLES) { setCycle(CYCLES); return; }
          setCycle((c) => c + 1);
          setStep(0);
        } else {
          setStep((s) => s + 1);
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, cycle, step]);

  const phase: Phase = cycle >= CYCLES ? 'done' : STEPS[step].phase;
  const dur = phase === 'done' ? 1 : STEPS[step].ms;
  const progress = phase === 'done' ? 1 : Math.min(1, (now - tStart) / dur);
  const label = phase === 'done' ? 'Well done.' : STEPS[step].label;

  const reduced = typeof matchMedia !== 'undefined'
    ? matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  // Scale: smaller while exhaling/holding, bigger on inhale.
  let scale = 1;
  if (phase === 'inhale') scale = 0.6 + 0.4 * progress;
  else if (phase === 'hold') scale = 1.0;
  else if (phase === 'exhale') scale = 1.0 - 0.4 * progress;
  if (reduced) scale = 1;

  return (
    <Dialog open={open} title="4-7-8 breathing" onClose={onClose}>
      <div class="flex flex-col items-center gap-4 py-2">
        <div class="relative h-40 w-40 flex items-center justify-center">
          <div
            aria-hidden="true"
            style={{
              transform: `scale(${scale.toFixed(3)})`,
              transition: reduced ? 'none' : 'transform 200ms linear',
              background: 'oklch(78% 0.18 200 / 0.30)',
            }}
            class="absolute inset-0 rounded-full"
          />
          <div class="relative text-center">
            <div class="text-base font-semibold">{label}</div>
            {phase !== 'done' && (
              <div class="text-xs text-ink-muted mt-1">
                Cycle {cycle + 1} / {CYCLES}
              </div>
            )}
          </div>
        </div>
        <div class="flex justify-end w-full">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {phase === 'done' ? 'Close' : 'Stop'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
