import { connectionStatus } from '../lib/store';
import { Pill } from './ui/Pill';

export function StatusBadge() {
  const s = connectionStatus.value;
  const tone = s === 'connected' ? 'good' : s === 'connecting' ? 'warn' : 'bad';
  const label = s === 'connected' ? 'Live' : s === 'connecting' ? 'Connecting' : 'Offline';
  return (
    <Pill tone={tone}>
      <span aria-hidden="true" class={[
        'h-1.5 w-1.5 rounded-full',
        tone === 'good' ? 'bg-good animate-pulse'
          : tone === 'warn' ? 'bg-warn'
          : 'bg-bad',
      ].join(' ')} />
      {label}
    </Pill>
  );
}
