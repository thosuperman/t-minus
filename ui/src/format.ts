const MIN = 60_000;

export const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
export const clockSec = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export function dur(min: number): string {
  const m = Math.abs(Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function tPlus(ms: number, plannedStart: number): string {
  const m = Math.round((ms - plannedStart) / MIN);
  const sign = m < 0 ? '−' : '+';
  const a = Math.abs(m);
  return `T${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

export const signed = (min: number) => (min === 0 ? 'on plan' : min > 0 ? `+${dur(min)}` : `−${dur(min)}`);
