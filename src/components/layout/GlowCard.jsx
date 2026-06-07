import { cn } from '@/lib/utils';

export default function GlowCard({ children, className, title }) {
  return (
    <div className={cn('relative rounded-2xl p-[1px]', className)}>
      <div
        className="absolute inset-0 rounded-2xl opacity-80"
        style={{
          background: 'linear-gradient(135deg, hsl(0 0% 100% / 0.2), hsl(0 0% 100% / 0.05), hsl(0 0% 100% / 0.2))',
        }}
      />
      <div className="glass relative rounded-2xl border border-white/10 p-6 shadow-card">
        {title && (
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {title}
          </h3>
        )}
        {children}
      </div>
    </div>
  );
}