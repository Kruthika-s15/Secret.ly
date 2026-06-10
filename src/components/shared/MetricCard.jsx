import { cn } from '@/lib/utils';

export default function MetricCard({ label, value, unit, sub, big }) {
  return (
    <div className="rounded-xl border border-border/80 bg-card/40 p-3 min-w-0 overflow-hidden">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground truncate">{label}</p>
      <p className={cn('mt-1 font-mono text-foreground truncate', big ? 'text-xl' : 'text-lg')}>
        {value}
        {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground truncate">{sub}</p>}
    </div>
  );
}