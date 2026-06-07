import { cn } from '@/lib/utils';

export default function MetricCard({ label, value, unit, sub, big }) {
  return (
    <div className="rounded-xl border border-border/80 bg-card/40 p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-mono text-foreground', big ? 'text-2xl' : 'text-xl')}>
        {value}
        {unit && <span className="ml-1 text-sm text-muted-foreground">{unit}</span>}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
