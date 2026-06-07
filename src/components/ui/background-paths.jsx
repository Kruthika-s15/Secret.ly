export function BackgroundPaths() {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5} -${189 + i * 6}C-${380 - i * 5} -${189 + i * 6} -${312 - i * 5} ${216 - i * 6} ${152 - i * 5} ${343 - i * 6}C${616 - i * 5} ${470 - i * 6} ${684 - i * 5} ${875 - i * 6} ${684 - i * 5} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
    duration: 20 + Math.random() * 10,
    delay: Math.random() * -20,
  }));

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden opacity-40">
      <svg className="w-full h-full text-primary" viewBox="0 0 696 316" fill="none" preserveAspectRatio="xMidYMid slice">
        {paths.map((path) => (
          <path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width + 0.4}
            strokeOpacity={0.25 + path.id * 0.025}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: 0,
              animation: `path-flow ${path.duration}s linear ${path.delay}s infinite`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}

export default BackgroundPaths;