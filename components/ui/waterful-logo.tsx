"use client";

import { useId } from "react";

type LogoProps = {
  size?: number;
  showText?: boolean;
  className?: string;
};

export function WaterfulZeroLogo({ size = 80, showText = true, className }: LogoProps) {
  const reactId = useId();
  const id = `wz-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
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
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="55%">
          <stop offset="50%" stopColor="#000" stopOpacity="0" />
          <stop offset="68%" stopColor="#ff2b2b" stopOpacity="0.85" />
          <stop offset="76%" stopColor="#ff8a00" stopOpacity="0.85" />
          <stop offset="82%" stopColor="#ffd400" stopOpacity="0.85" />
          <stop offset="88%" stopColor="#22c55e" stopOpacity="0.85" />
          <stop offset="94%" stopColor="#22c5ff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.6" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill={`url(#${id}-glow)`} />
      <circle cx="100" cy="100" r="78" fill="#000" />
      {showText ? (
        <g>
          <text
            x="100"
            y="95"
            textAnchor="middle"
            fontFamily="'Inter', 'Segoe UI', system-ui, sans-serif"
            fontWeight="600"
            fontSize="30"
            fill="white"
            letterSpacing="-1"
          >
            waterful
          </text>
          <circle cx="142" cy="78" r="3.2" fill="#22c5ff" />
          <text
            x="100"
            y="132"
            textAnchor="middle"
            fontFamily="'Inter', 'Segoe UI', system-ui, sans-serif"
            fontWeight="800"
            fontSize="34"
            fill="white"
            letterSpacing="2"
          >
            ZERO
          </text>
        </g>
      ) : (
        <g>
          <text
            x="100"
            y="118"
            textAnchor="middle"
            fontFamily="'Inter', 'Segoe UI', system-ui, sans-serif"
            fontWeight="800"
            fontSize="56"
            fill="white"
            letterSpacing="1"
          >
            wZ
          </text>
          <circle cx="120" cy="80" r="4" fill="#22c5ff" />
        </g>
      )}
    </svg>
  );
}

export function WaterfulZeroMark({ size = 32, className }: { size?: number; className?: string }) {
  return <WaterfulZeroLogo size={size} showText={false} className={className} />;
}
