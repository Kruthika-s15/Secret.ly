export default function Waveform({ data, label, color = 'hsl(var(--primary))' }) {
  const max = Math.max(...data, 0.001);

  return (
    <div className="w-full">
      {label && <p className="mb-2 text-xs text-muted-foreground">{label}</p>}
      <div className="flex h-16 items-center gap-[1px]">
        {data.map((v, i) => (
          <div
            key={i}
            style={{
              height: `${Math.max(4, (v / max) * 100)}%`,
              background: color,
              opacity: 0.5 + (v / max) * 0.5,
            }}
            className="w-full rounded-sm"
          />
        ))}
      </div>
    </div>
  );
}
