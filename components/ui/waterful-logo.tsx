type LogoProps = {
  size?: number;
  showText?: boolean;
  glow?: boolean;
  className?: string;
};

export function WaterfulZeroLogo({
  size = 80,
  showText = true,
  glow = true,
  className,
}: LogoProps) {
  const id = `wz-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Waterful Zero"
    >
      <defs>
        <radialGradient id={`${id}-rim`} cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="80%" stopColor="#ff3b3b" stopOpacity="0.7" />
          <stop offset="90%" stopColor="#ffb800" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.5" />
        </radialGradient>
        <linearGradient id={`${id}-ring`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff3b3b" />
          <stop offset="20%" stopColor="#ff8a3b" />
          <stop offset="40%" stopColor="#ffd83b" />
          <stop offset="60%" stopColor="#3bff8a" />
          <stop offset="80%" stopColor="#3b9eff" />
          <stop offset="100%" stopColor="#b03bff" />
        </linearGradient>
      </defs>
      {glow && (
        <circle cx="100" cy="100" r="98" fill={`url(#${id}-rim)`} opacity="0.85" />
      )}
      <circle cx="100" cy="100" r="80" fill="#000" />
      {glow && (
        <circle
          cx="100"
          cy="100"
          r="80"
          fill="none"
          stroke={`url(#${id}-ring)`}
          strokeWidth="1.2"
          opacity="0.9"
        />
      )}
      {showText ? (
        <g>
          <text
            x="100"
            y="92"
            textAnchor="middle"
            fontFamily="'Inter', 'Segoe UI', system-ui, sans-serif"
            fontWeight="600"
            fontSize="32"
            fill="white"
            letterSpacing="-1"
          >
            waterful
          </text>
          <circle cx="146" cy="74" r="3" fill="#22c5ff" />
          <text
            x="100"
            y="130"
            textAnchor="middle"
            fontFamily="'Inter', 'Segoe UI', system-ui, sans-serif"
            fontWeight="800"
            fontSize="36"
            fill="white"
            letterSpacing="2"
          >
            ZERO
          </text>
        </g>
      ) : (
        <g>
          <path
            d="M85 80 L85 115 Q85 125 100 125 Q115 125 115 115 L115 80 Z"
            fill="white"
            opacity="0.9"
          />
          <circle cx="108" cy="72" r="4" fill="#22c5ff" />
        </g>
      )}
    </svg>
  );
}

export function WaterfulZeroMark({ size = 32, className }: { size?: number; className?: string }) {
  return <WaterfulZeroLogo size={size} showText={false} glow className={className} />;
}
